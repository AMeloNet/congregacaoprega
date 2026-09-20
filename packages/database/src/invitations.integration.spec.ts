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
  const name = `invitation_${randomUUID().replaceAll('-', '')}_test`;
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

describe('IDN-001B invitation and audit schema', () => {
  it('enforces pending invitation boundaries and token secrecy', async () => {
    await withDisposableDatabase(async (url, pool) => {
      expect(runPrisma(url, ['migrate', 'deploy'])).toBe(0);
      const creator = randomUUID();
      const congregation = randomUUID();
      const tokenDigest = Buffer.alloc(32, 1);
      await pool.query(
        `INSERT INTO identity_account
          (id, provider_issuer, provider_subject, email, email_verified, is_master)
          VALUES ($1, 'https://identity.example.test/', 'creator', 'creator@example.test', true, false)`,
        [creator],
      );
      await pool.query('INSERT INTO congregation (id, name) VALUES ($1, $2)', [
        congregation,
        'Congregação A',
      ]);
      await pool.query(
        `INSERT INTO access_invitation
          (id, kind, congregation_id, recipient_email, recipient_email_normalized,
           token_digest, target_role, status, expires_at, created_by_account_id)
         VALUES ($1, 'MEMBERSHIP', $2, 'Person@Example.Test', 'person@example.test',
                 $3, 'PUBLISHER', 'PENDING', now() + interval '7 days', $4)`,
        [randomUUID(), congregation, tokenDigest, creator],
      );
      await expect(
        pool.query(
          `INSERT INTO access_invitation
            (id, kind, congregation_id, recipient_email, recipient_email_normalized,
             token_digest, target_role, status, expires_at)
           VALUES ($1, 'MEMBERSHIP', $2, 'person@example.test', 'person@example.test',
                   $3, 'PUBLISHER', 'PENDING', now() + interval '7 days')`,
          [randomUUID(), congregation, Buffer.alloc(32, 2)],
        ),
      ).rejects.toMatchObject({ code: '23505' });
      await expect(
        pool.query(
          `INSERT INTO access_invitation
            (id, kind, recipient_email, recipient_email_normalized, token_digest,
             target_role, status, expires_at)
           VALUES ($1, 'MEMBERSHIP', 'other@example.test', 'wrong@example.test', $2,
                   'PUBLISHER', 'PENDING', now() + interval '7 days')`,
          [randomUUID(), Buffer.alloc(32, 3)],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        pool.query(
          `INSERT INTO access_invitation
            (id, kind, congregation_id, recipient_email, recipient_email_normalized,
             token_digest, target_role, status, expires_at)
           VALUES ($1, 'MEMBERSHIP', $2, 'third@example.test', 'third@example.test',
                   $3, 'PUBLISHER', 'PENDING', now() + interval '7 days')`,
          [randomUUID(), congregation, tokenDigest],
        ),
      ).rejects.toMatchObject({ code: '23505' });
      await pool.query(
        `UPDATE access_invitation SET status = 'SUPERSEDED', invalidated_at = now()
         WHERE congregation_id = $1 AND recipient_email_normalized = 'person@example.test'`,
        [congregation],
      );
      const resend = await Promise.allSettled(
        Array.from({ length: 2 }, () =>
          pool.query(
            `INSERT INTO access_invitation
              (id, kind, congregation_id, recipient_email, recipient_email_normalized,
               token_digest, target_role, status, expires_at)
             VALUES ($1, 'MEMBERSHIP', $2, 'person@example.test', 'person@example.test',
                     $3, 'PUBLISHER', 'PENDING', now() + interval '7 days')`,
            [randomUUID(), congregation, Buffer.from(randomUUID())],
          ),
        ),
      );
      expect(
        resend.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        resend.find((result) => result.status === 'rejected'),
      ).toMatchObject({
        reason: { code: '23505' },
      });
    });
  }, 120_000);

  it('isolates master bootstrap and preserves auditable references', async () => {
    await withDisposableDatabase(async (url, pool) => {
      expect(runPrisma(url, ['migrate', 'deploy'])).toBe(0);
      const account = randomUUID();
      const congregation = randomUUID();
      const membership = randomUUID();
      const invitation = randomUUID();
      await pool.query(
        `INSERT INTO identity_account
          (id, provider_issuer, provider_subject, email)
          VALUES ($1, 'https://identity.example.test/', 'subject', 'person@example.test')`,
        [account],
      );
      await pool.query('INSERT INTO congregation (id, name) VALUES ($1, $2)', [
        congregation,
        'Congregação B',
      ]);
      await pool.query(
        `INSERT INTO membership (id, account_id, congregation_id, role, status)
         VALUES ($1, $2, $3, 'PUBLISHER', 'ACTIVE')`,
        [membership, account, congregation],
      );
      await pool.query(
        `INSERT INTO access_invitation
          (id, kind, recipient_email, recipient_email_normalized, token_digest,
           status, expires_at)
         VALUES ($1, 'MASTER_BOOTSTRAP', 'maintainer@example.test',
                 'maintainer@example.test', $2, 'PENDING', now() + interval '24 hours')`,
        [invitation, Buffer.alloc(32, 4)],
      );
      await expect(
        pool.query(
          `INSERT INTO access_invitation
            (id, kind, recipient_email, recipient_email_normalized, token_digest,
             status, expires_at)
           VALUES ($1, 'MASTER_BOOTSTRAP', 'another@example.test',
                   'another@example.test', $2, 'PENDING', now() + interval '24 hours')`,
          [randomUUID(), Buffer.alloc(32, 5)],
        ),
      ).rejects.toMatchObject({ code: '23505' });
      await expect(
        pool.query(
          `INSERT INTO access_invitation
            (id, kind, congregation_id, recipient_email, recipient_email_normalized,
             token_digest, target_role, status, expires_at)
           VALUES ($1, 'MASTER_BOOTSTRAP', $2, 'bad@example.test', 'bad@example.test',
                   $3, 'LOCAL_ADMIN', 'PENDING', now() + interval '24 hours')`,
          [randomUUID(), congregation, Buffer.alloc(32, 6)],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await pool.query(
        `INSERT INTO identity_audit_event
          (id, event_type, outcome, actor_account_id, subject_account_id,
           congregation_id, invitation_id, membership_id)
         VALUES ($1, 'MEMBERSHIP_REVOKED', 'SUCCEEDED', $2, $2, $3, $4, $5)`,
        [randomUUID(), account, congregation, invitation, membership],
      );
      expect(
        (
          await pool.query(
            'SELECT count(*)::int AS total FROM identity_audit_event WHERE membership_id = $1',
            [membership],
          )
        ).rows[0].total,
      ).toBe(1);
      await expect(
        pool.query(
          `INSERT INTO identity_audit_event
            (id, event_type, outcome, subject_account_id)
           VALUES ($1, 'MEMBERSHIP_REVOKED', 'SUCCEEDED', $2)`,
          [randomUUID(), randomUUID()],
        ),
      ).rejects.toMatchObject({ code: '23503' });
    });
  }, 120_000);

  it('reapplies the history and detects drift', async () => {
    await withDisposableDatabase(async (url, pool) => {
      expect(runPrisma(url, ['migrate', 'deploy'])).toBe(0);
      const invitation = randomUUID();
      await pool.query(
        `INSERT INTO access_invitation
          (id, kind, recipient_email, recipient_email_normalized, token_digest,
           status, expires_at)
         VALUES ($1, 'MASTER_BOOTSTRAP', 'maintainer@example.test',
                 'maintainer@example.test', $2, 'PENDING', now() + interval '24 hours')`,
        [invitation, Buffer.alloc(32, 7)],
      );
      expect(runPrisma(url, ['migrate', 'deploy'])).toBe(0);
      expect(
        (
          await pool.query(
            'SELECT count(*)::int AS total FROM _prisma_migrations',
          )
        ).rows[0].total,
      ).toBe(2);
      expect(
        (
          await pool.query(
            'SELECT count(*)::int AS total FROM access_invitation WHERE id = $1',
            [invitation],
          )
        ).rows[0].total,
      ).toBe(1);
      const diff = [
        'migrate',
        'diff',
        '--from-config-datasource',
        '--to-schema',
        'prisma/schema.prisma',
        '--exit-code',
      ];
      expect(runPrisma(url, diff)).toBe(0);
      await pool.query('ALTER TABLE access_invitation ADD COLUMN rogue text');
      expect(runPrisma(url, diff)).toBe(2);
    });
  }, 120_000);
});
