import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { dropDisposableDatabase } from './test-support/database.js';

const adminUrl = process.env.TEST_DATABASE_URL;
const packageDir = resolve(import.meta.dirname, '..');

function runPrisma(
  url: string,
  fixture: 'previous' | 'full' | 'broken',
  args: string[],
) {
  const result = spawnSync(
    'pnpm',
    ['exec', 'prisma', ...args, '--config', 'test-fixtures.config.ts'],
    {
      cwd: packageDir,
      env: { ...process.env, DATABASE_URL: url, MIGRATION_FIXTURE: fixture },
      encoding: 'utf8',
      shell: process.platform === 'win32',
      timeout: 60_000,
    },
  );
  if (result.error) throw result.error;
  return {
    status: result.status,
    output: `${result.stdout}\n${result.stderr}`,
  };
}

async function withDisposableDatabase(
  fn: (url: string, pool: Pool) => Promise<void>,
) {
  if (!adminUrl || !new URL(adminUrl).pathname.slice(1).endsWith('_test')) {
    throw new Error(
      'TEST_DATABASE_URL must name an explicitly disposable *_test database.',
    );
  }
  const name = `migration_${randomUUID().replaceAll('-', '')}_test`;
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
    try {
      await dropDisposableDatabase(admin, name);
    } finally {
      await admin.end();
    }
  }
}

async function verifyCatalog(pool: Pool) {
  const unexpected = await pool.query<{ name: string }>(`
    SELECT relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')
    UNION ALL
    SELECT tgname AS name FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal
  `);
  if (unexpected.rows.length)
    throw new Error(
      `Unmanaged SQL objects: ${unexpected.rows.map((r) => r.name).join(', ')}`,
    );
}

describe('isolated Prisma Migrate history', () => {
  it('creates from empty, upgrades while preserving data and never reapplies finished migrations', async () => {
    await withDisposableDatabase(async (url, pool) => {
      expect(runPrisma(url, 'full', ['migrate', 'deploy']).status).toBe(0);
      expect(
        (
          await pool.query(
            'SELECT count(*)::int AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL',
          )
        ).rows[0].count,
      ).toBe(2);
      expect(runPrisma(url, 'full', ['migrate', 'deploy']).status).toBe(0);
      expect(
        (
          await pool.query(
            'SELECT count(*)::int AS count FROM _prisma_migrations',
          )
        ).rows[0].count,
      ).toBe(2);
      await verifyCatalog(pool);
    });
    await withDisposableDatabase(async (url, pool) => {
      expect(runPrisma(url, 'previous', ['migrate', 'deploy']).status).toBe(0);
      await pool.query(
        "INSERT INTO sample (id, label) VALUES (1, 'fictional')",
      );
      expect(runPrisma(url, 'full', ['migrate', 'deploy']).status).toBe(0);
      expect(
        (
          await pool.query<{ label: string; note: string | null }>(
            'SELECT label, note FROM sample WHERE id=1',
          )
        ).rows[0],
      ).toEqual({ label: 'fictional', note: null });
      expect(runPrisma(url, 'full', ['migrate', 'status']).status).toBe(0);
      expect(
        runPrisma(url, 'full', [
          'migrate',
          'diff',
          '--from-config-datasource',
          '--to-schema',
          '../../tests/migration-fixtures/schema.prisma',
          '--exit-code',
        ]).status,
      ).toBe(0);
      await pool.query('ALTER TABLE sample ADD COLUMN rogue TEXT');
      expect(
        runPrisma(url, 'full', [
          'migrate',
          'diff',
          '--from-config-datasource',
          '--to-schema',
          '../../tests/migration-fixtures/schema.prisma',
          '--exit-code',
        ]).status,
      ).toBe(2);
      await pool.query('CREATE VIEW unmanaged_view AS SELECT id FROM sample');
      await expect(verifyCatalog(pool)).rejects.toThrow('unmanaged_view');
    });
  }, 240_000);

  it('stops and records invalid SQL instead of marking it successful', async () => {
    await withDisposableDatabase(async (url, pool) => {
      const result = runPrisma(url, 'broken', ['migrate', 'deploy']);
      expect(result.status).not.toBe(0);
      const history = await pool.query<{ finished_at: Date | null }>(
        'SELECT finished_at FROM _prisma_migrations',
      );
      expect(history.rows).toHaveLength(1);
      expect(history.rows[0]?.finished_at).toBeNull();
    });
  }, 90_000);
});
