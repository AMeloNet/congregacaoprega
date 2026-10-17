import { PointsService } from '../../../apps/api/src/points.service.js';
import { randomUUID } from 'node:crypto';
import { runPrisma, withDisposableDatabase } from './test-support/database.js';

describe('preaching points', () => {
  it('persists creation and editing, validates inputs and isolates congregation administrators', async () => {
    await withDisposableDatabase(async (url, pool) => {
      expect(runPrisma(url, ['migrate', 'deploy'])).toBe(0);
      const actor = randomUUID(),
        a = randomUUID(),
        b = randomUUID();
      await pool.query(
        "INSERT INTO identity_account (id,provider_issuer,provider_subject,email,email_verified) VALUES ($1,'https://example.test/','points-admin','points@example.test',true)",
        [actor],
      );
      await pool.query(
        "INSERT INTO congregation (id,name) VALUES ($1,'Test A'),($2,'Test B')",
        [a, b],
      );
      await pool.query(
        "INSERT INTO membership (id,account_id,congregation_id,role) VALUES ($1,$2,$3,'LOCAL_ADMIN'),($4,$2,$5,'PUBLISHER')",
        [randomUUID(), actor, a, randomUUID(), b],
      );
      const service = new PointsService(pool);
      expect(await service.execute(actor, a, 'list')).toEqual([]);
      const input = {
        name: ' Point A ',
        address: ' Test street ',
        description: 'Example',
        allowedTypes: ['CART', 'DISPLAY'],
      };
      const point = await service.execute(actor, a, 'create', input);
      expect(point).toMatchObject({
        name: 'Point A',
        address: 'Test street',
        capacity: 1,
        allowedTypes: ['CART', 'DISPLAY'],
      });
      await expect(
        service.execute(actor, a, 'create', { ...input, name: 'point a' }),
      ).rejects.toMatchObject({ status: 409 });
      for (const invalid of [
        { name: '' },
        { name: 'a'.repeat(81) },
        { address: 42 },
        { address: 'a'.repeat(251) },
        { description: 'a'.repeat(251) },
        { capacity: 0 },
        { capacity: 1.5 },
        { capacity: 2147483648 },
        { capacity: '1' },
        { allowedTypes: [] },
        { allowedTypes: ['OTHER'] },
        { allowedTypes: ['CART', 'CART'] },
        { congregationId: b },
      ]) {
        await expect(
          service.execute(actor, a, 'create', { ...input, ...invalid }),
        ).rejects.toMatchObject({ status: 400 });
      }
      await expect(service.execute(actor, b, 'list')).rejects.toMatchObject({
        status: 403,
      });
      await expect(
        service.execute(actor, b, 'create', input),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        service.execute(
          actor,
          b,
          'update',
          { ...input, capacity: 2 },
          point.id,
        ),
      ).rejects.toMatchObject({ status: 403 });
      await pool.query(
        "UPDATE membership SET role='LOCAL_ADMIN' WHERE congregation_id=$1",
        [b],
      );
      expect(await service.execute(actor, b, 'list')).toEqual([]);
      await expect(
        service.execute(
          actor,
          b,
          'update',
          { ...input, capacity: 2 },
          point.id,
        ),
      ).rejects.toMatchObject({ status: 404 });
      await service.execute(actor, b, 'create', input);
      const updated = {
        name: 'Renamed',
        address: 'New street',
        description: 'Updated',
        capacity: 2,
        allowedTypes: ['KIOSK'],
      };
      expect(
        await service.execute(actor, a, 'update', updated, point.id),
      ).toEqual({ id: point.id, photo: '', ...updated });
      expect(await new PointsService(pool).execute(actor, a, 'list')).toEqual([
        { id: point.id, photo: '', ...updated },
      ]);
      const other = await service.execute(actor, a, 'create', {
        ...input,
        name: 'Other',
      });
      await expect(
        service.execute(
          actor,
          a,
          'update',
          { ...updated, name: 'renamed' },
          other.id,
        ),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        pool.query('UPDATE preaching_point SET capacity=0 WHERE id=$1', [
          point.id,
        ]),
      ).rejects.toMatchObject({ code: '23514' });
      await pool.query(
        'UPDATE identity_account SET email_verified=false WHERE id=$1',
        [actor],
      );
      await expect(service.execute(actor, a, 'list')).rejects.toMatchObject({
        status: 403,
      });
      await pool.query(
        'UPDATE identity_account SET email_verified=true,is_master=true WHERE id=$1',
        [actor],
      );
      await pool.query(
        "UPDATE membership SET status='REVOKED',revoked_at=now() WHERE congregation_id=$1",
        [a],
      );
      await expect(service.execute(actor, a, 'list')).rejects.toMatchObject({
        status: 403,
      });
    });
  }, 120_000);
});
