import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Pool } from 'pg';

const adminUrl = process.env.TEST_DATABASE_URL;
const packageDir = resolve(import.meta.dirname, '..');

function runPrisma(url: string, args: string[]) {
  const result = spawnSync('pnpm', ['exec', 'prisma', ...args], {
    cwd: packageDir,
    env: { ...process.env, DATABASE_URL: url },
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 60_000,
  });
  if (result.error) throw result.error;
  return result.status;
}

async function withDisposableDatabase(
  fn: (url: string, pool: Pool) => Promise<void>,
) {
  if (!adminUrl || !new URL(adminUrl).pathname.slice(1).endsWith('_test')) {
    throw new Error(
      'TEST_DATABASE_URL must name a disposable *_test database.',
    );
  }
  const name = `identity_${randomUUID().replaceAll('-', '')}_test`;
  const admin = new Pool({ connectionString: adminUrl });
  const target = new URL(adminUrl);
  target.pathname = `/${name}`;
  try {
    await admin.query(`CREATE DATABASE ${name}`);
    const pool = new Pool({ connectionString: target.toString() });
    try {
      await fn(target.toString(), pool);
    } finally {
      await pool.end();
    }
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.end();
  }
}

describe('IDN-001A identity schema', () => {
  it('isolates local roles and enforces relational constraints', async () => {
    await withDisposableDatabase(async (url, pool) => {
      expect(runPrisma(url, ['migrate', 'deploy'])).toBe(0);

      const account = randomUUID();
      const first = randomUUID();
      const second = randomUUID();
      await pool.query(
        `INSERT INTO identity_account
          (id, provider_issuer, provider_subject, email, email_verified, is_master)
          VALUES ($1, 'https://identity.example.test/', 'subject-1', 'one@example.test', true, false)`,
        [account],
      );
      await pool.query(
        'INSERT INTO congregation (id, name) VALUES ($1, $2), ($3, $4)',
        [first, 'Congregação A', second, 'Congregação B'],
      );
      await pool.query(
        `INSERT INTO membership (id, account_id, congregation_id, role, status)
         VALUES ($1, $2, $3, 'LOCAL_ADMIN', 'ACTIVE'),
                ($4, $2, $5, 'PUBLISHER', 'ACTIVE')`,
        [randomUUID(), account, first, randomUUID(), second],
      );

      const roles = await pool.query<{ congregation_id: string; role: string }>(
        'SELECT congregation_id, role FROM membership WHERE account_id = $1 ORDER BY congregation_id',
        [account],
      );
      expect(roles.rows).toHaveLength(2);
      expect(
        new Map(roles.rows.map((row) => [row.congregation_id, row.role])),
      ).toEqual(
        new Map([
          [first, 'LOCAL_ADMIN'],
          [second, 'PUBLISHER'],
        ]),
      );
      await expect(
        pool.query(
          `INSERT INTO membership (id, account_id, congregation_id, role, status)
           VALUES ($1, $2, $3, 'PUBLISHER', 'ACTIVE')`,
          [randomUUID(), account, first],
        ),
      ).rejects.toMatchObject({ code: '23505' });
      await expect(
        pool.query(
          `INSERT INTO membership (id, account_id, congregation_id, role, status)
           VALUES ($1, $2, $3, 'PUBLISHER', 'ACTIVE')`,
          [randomUUID(), randomUUID(), first],
        ),
      ).rejects.toMatchObject({ code: '23503' });
      await expect(
        pool.query(
          `INSERT INTO identity_account
           (id, provider_issuer, provider_subject, email)
           VALUES ($1, 'https://identity.example.test/', 'subject-1', 'other@example.test')`,
          [randomUUID()],
        ),
      ).rejects.toMatchObject({ code: '23505' });
      await expect(
        pool.query(
          `INSERT INTO membership (id, account_id, congregation_id, role)
           VALUES ($1, $2, $3, 'UNKNOWN')`,
          [randomUUID(), account, first],
        ),
      ).rejects.toMatchObject({ code: '22P02' });
      await expect(
        pool.query(
          "UPDATE membership SET status = 'REVOKED' WHERE account_id = $1 AND congregation_id = $2",
          [account, first],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        pool.query(
          'UPDATE membership SET revoked_at = now() WHERE account_id = $1 AND congregation_id = $2',
          [account, first],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await pool.query(
        "UPDATE membership SET status = 'REVOKED', revoked_at = now() WHERE account_id = $1 AND congregation_id = $2",
        [account, first],
      );
      await pool.query(
        "UPDATE membership SET status = 'ACTIVE', revoked_at = NULL WHERE account_id = $1 AND congregation_id = $2",
        [account, first],
      );
      const third = randomUUID();
      await pool.query('INSERT INTO congregation (id, name) VALUES ($1, $2)', [
        third,
        'Congregação C',
      ]);
      const concurrent = await Promise.allSettled(
        Array.from({ length: 2 }, () =>
          pool.query(
            `INSERT INTO membership (id, account_id, congregation_id)
             VALUES ($1, $2, $3)`,
            [randomUUID(), account, third],
          ),
        ),
      );
      expect(
        concurrent.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        concurrent.find((result) => result.status === 'rejected'),
      ).toMatchObject({ reason: { code: '23505' } });
      const unlinked = randomUUID();
      await pool.query(
        `INSERT INTO identity_account
         (id, provider_issuer, provider_subject, email, email_verified)
         VALUES ($1, 'https://identity.example.test/', 'subject-unlinked', 'unlinked@example.test', true)`,
        [unlinked],
      );
      expect(
        (
          await pool.query(
            'SELECT count(*)::int AS total FROM membership WHERE account_id = $1',
            [unlinked],
          )
        ).rows[0].total,
      ).toBe(0);
      await pool.query('UPDATE identity_account SET email = $2 WHERE id = $1', [
        account,
        'changed@example.test',
      ]);
      const identity = await pool.query<{
        provider_subject: string;
        email: string;
      }>('SELECT provider_subject, email FROM identity_account WHERE id = $1', [
        account,
      ]);
      expect(identity.rows[0]).toEqual({
        provider_subject: 'subject-1',
        email: 'changed@example.test',
      });
      expect(
        (
          await pool.query(
            'SELECT count(*)::int AS total FROM membership WHERE account_id = $1',
            [account],
          )
        ).rows[0].total,
      ).toBe(3);
    });
  }, 120_000);

  it('preserves data on reapplication and detects drift', async () => {
    await withDisposableDatabase(async (url, pool) => {
      expect(runPrisma(url, ['migrate', 'deploy'])).toBe(0);
      const completedMigrationCount = (
        await pool.query(
          'SELECT count(*)::int AS total FROM _prisma_migrations',
        )
      ).rows[0].total;
      const account = randomUUID();
      await pool.query(
        `INSERT INTO identity_account
          (id, provider_issuer, provider_subject, email, email_verified, is_master)
          VALUES ($1, 'https://identity.example.test/', 'subject-2', 'two@example.test', false, false)`,
        [account],
      );
      expect(runPrisma(url, ['migrate', 'deploy'])).toBe(0);
      expect(
        (
          await pool.query('SELECT email FROM identity_account WHERE id = $1', [
            account,
          ])
        ).rows[0].email,
      ).toBe('two@example.test');
      expect(
        (
          await pool.query(
            'SELECT count(*)::int AS total FROM _prisma_migrations',
          )
        ).rows[0].total,
      ).toBe(completedMigrationCount);
      const diff = [
        'migrate',
        'diff',
        '--from-migrations',
        'prisma/migrations',
        '--to-config-datasource',
        '--exit-code',
      ];
      expect(runPrisma(url, diff)).toBe(0);
      await pool.query('ALTER TABLE identity_account ADD COLUMN rogue text');
      expect(runPrisma(url, diff)).toBe(2);
    });
  }, 120_000);
});
