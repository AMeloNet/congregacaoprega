import { EquipmentService } from '../../../apps/api/src/equipment.service.js';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { dropDisposableDatabase } from './test-support/database.js';

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
    try {
      await dropDisposableDatabase(admin, name);
    } finally {
      await admin.end();
    }
  }
}

describe('EQP-001 equipment lifecycle', () => {
  it('persists units and state history while enforcing validation and congregation isolation', async () => {
    await withDisposableDatabase(async (url, pool) => {
      expect(runPrisma(url, ['migrate', 'deploy'])).toBe(0);
      const actor = randomUUID(),
        a = randomUUID(),
        b = randomUUID();
      await pool.query(
        "INSERT INTO identity_account (id, provider_issuer, provider_subject, email, email_verified) VALUES ($1,'https://example.test/','equipment-admin','equipment@example.test',true)",
        [actor],
      );
      await pool.query(
        'INSERT INTO congregation (id,name) VALUES ($1,$2),($3,$4)',
        [a, 'Test A', b, 'Test B'],
      );
      await pool.query(
        "INSERT INTO membership (id,account_id,congregation_id,role) VALUES ($1,$2,$3,'LOCAL_ADMIN'),($4,$2,$5,'PUBLISHER')",
        [randomUUID(), actor, a, randomUUID(), b],
      );
      const service = new EquipmentService(pool);
      expect(await service.execute(actor, a, 'list')).toEqual([]);
      const item = await service.execute(actor, a, 'create', {
        name: ' Unit A ',
        type: 'CART',
        observation: 'Initial',
      });
      expect(item).toMatchObject({ name: 'Unit A', active: true });
      await expect(
        service.execute(actor, a, 'create', {
          name: 'unit a',
          type: 'DISPLAY',
        }),
      ).rejects.toMatchObject({ status: 409 });
      for (const input of [
        { name: '', type: 'CART' },
        { name: 'Array type', type: ['CART'] },
        { name: 'A', type: 'INVALID' },
        { name: 'A', type: 'CART', observation: 'a'.repeat(251) },
        { name: 'A', type: 'CART', congregationId: b },
      ]) {
        await expect(
          service.execute(actor, a, 'create', input),
        ).rejects.toMatchObject({ status: 400 });
      }
      await expect(service.execute(actor, b, 'list')).rejects.toMatchObject({
        status: 403,
      });
      await expect(
        service.execute(actor, b, 'create', { name: 'B', type: 'CART' }),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        service.execute(actor, b, 'state', { active: false }, item.id),
      ).rejects.toMatchObject({ status: 403 });
      await pool.query(
        "UPDATE membership SET role='LOCAL_ADMIN' WHERE congregation_id=$1",
        [b],
      );
      expect(await service.execute(actor, b, 'list')).toEqual([]);
      await expect(
        service.execute(actor, b, 'state', { active: false }, item.id),
      ).rejects.toMatchObject({ status: 404 });
      await service.execute(
        actor,
        a,
        'state',
        { active: false, observation: 'Maintenance' },
        item.id,
      );
      expect(await service.execute(actor, a, 'list')).toEqual([
        expect.objectContaining({ active: false, observation: 'Maintenance' }),
      ]);
      await expect(
        service.execute(actor, a, 'state', { active: false }, item.id),
      ).rejects.toMatchObject({ status: 409 });
      await service.execute(
        actor,
        a,
        'state',
        { active: true, observation: 'Ready' },
        item.id,
      );
      const history = await pool.query(
        'SELECT active,observation,actor_account_id FROM equipment_state_history WHERE equipment_id=$1 ORDER BY created_at',
        [item.id],
      );
      expect(history.rows).toEqual([
        { active: true, observation: 'Initial', actor_account_id: actor },
        { active: false, observation: 'Maintenance', actor_account_id: actor },
        { active: true, observation: 'Ready', actor_account_id: actor },
      ]);
      await pool.query(
        "UPDATE membership SET status='REVOKED', revoked_at=now() WHERE congregation_id=$1",
        [a],
      );
      await expect(service.execute(actor, a, 'list')).rejects.toMatchObject({
        status: 403,
      });
    });
  }, 120_000);
});
