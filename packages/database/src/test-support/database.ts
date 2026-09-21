import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve, isAbsolute } from 'node:path';
import { Pool } from 'pg';

const packageDir = resolve(import.meta.dirname, '../..');
export const identityMigration = '20260919223000_create_identity_core';

function prismaCommand(
  url: string,
  args: string[],
  env: Record<string, string> = {},
) {
  const result = spawnSync('pnpm', ['exec', 'prisma', ...args], {
    cwd: packageDir,
    env: { ...process.env, DATABASE_URL: url, ...env },
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 60_000,
  });
  if (result.error) throw result.error;
  return result;
}

export function runPrisma(url: string, args: string[]) {
  return prismaCommand(url, args).status;
}

export async function dropDisposableDatabase(admin: Pool, name: string) {
  if (!/^(?:identity|invitation|migration)_[0-9a-f]{32}_test$/.test(name)) {
    throw new Error(
      'Refusing to drop a database without a disposable test name.',
    );
  }
  for (let attempt = 0; attempt < 50; attempt++) {
    const sessions = await admin.query<{ total: number }>(
      `SELECT count(*)::integer AS total FROM pg_stat_activity
       WHERE datname = $1 AND backend_type = 'client backend'`,
      [name],
    );
    if (sessions.rows[0]?.total === 0) {
      try {
        await admin.query('DROP DATABASE IF EXISTS ' + name);
        return;
      } catch (error) {
        if ((error as { code?: string }).code !== '55006') throw error;
      }
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    'Timed out waiting for disposable database sessions to close.',
  );
}

export async function withDisposableDatabase(
  fn: (url: string, pool: Pool) => Promise<void>,
) {
  const adminUrl = process.env.TEST_DATABASE_URL;
  if (!adminUrl || !new URL(adminUrl).pathname.slice(1).endsWith('_test')) {
    throw new Error(
      'TEST_DATABASE_URL must name a disposable *_test database.',
    );
  }
  const name = 'identity_' + randomUUID().replaceAll('-', '') + '_test';
  const admin = new Pool({ connectionString: adminUrl });
  const target = new URL(adminUrl);
  target.pathname = '/' + name;
  let created = false;
  try {
    await admin.query('CREATE DATABASE ' + name);
    created = true;
    const pool = new Pool({ connectionString: target.toString() });
    try {
      await fn(target.toString(), pool);
    } finally {
      await pool.end();
    }
  } finally {
    try {
      if (created) await dropDisposableDatabase(admin, name);
    } finally {
      await admin.end();
    }
  }
}

export async function deployIdentityCore(url: string) {
  const temporaryRoot = resolve(tmpdir());
  const directory = await mkdtemp(join(temporaryRoot, 'identity-history-'));
  const child = relative(temporaryRoot, resolve(directory));
  if (!child || child.startsWith('..') || isAbsolute(child)) {
    throw new Error(
      'Refusing to remove a directory outside the temporary root.',
    );
  }
  try {
    const migrations = join(packageDir, 'prisma/migrations');
    await cp(
      join(migrations, 'migration_lock.toml'),
      join(directory, 'migration_lock.toml'),
    );
    await cp(
      join(migrations, identityMigration),
      join(directory, identityMigration),
      { recursive: true },
    );
    return prismaCommand(
      url,
      ['migrate', 'deploy', '--config', 'src/test-support/history.config.ts'],
      {
        TEST_MIGRATIONS_PATH: directory,
      },
    ).status;
  } finally {
    await rm(directory, { recursive: true });
  }
}

export async function createSchemaReference(url: string, pool: Pool) {
  const result = prismaCommand(url, [
    'migrate',
    'diff',
    '--from-empty',
    '--to-schema',
    'prisma/schema.prisma',
    '--script',
  ]);
  if (result.status !== 0)
    throw new Error('Prisma schema SQL generation failed.');
  await pool.query(result.stdout);
}
