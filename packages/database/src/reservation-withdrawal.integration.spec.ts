import { randomUUID } from 'node:crypto';
import { runPrisma, withDisposableDatabase } from './test-support/database.js';
import { reservationApp } from './test-support/reservation-app.js';
import { ReservationChangesService } from '../../../apps/api/src/reservation-changes.service.js';
import { ReservationsService } from '../../../apps/api/src/reservations.service.js';
import { localInstant } from '../../../apps/api/src/reservation-time.js';
describe('participation withdrawal', () => {
  it('preserves partial attendance and daily limits across withdrawal and re-entry, respects cutoff and monthly lock, and accounts for elapsed cancellation time', async () => {
    await withDisposableDatabase(async (url, pool) => {
      expect(runPrisma(url, ['migrate', 'deploy'])).toBe(0);
      const f = await reservationApp(pool);
      try {
        for (const startHour of [0, 2, 4]) await f.book(2, { startHour });
        const r = await f.book();
        await f.request(`reservations/${r.id}/join`, 2);
        const start = localInstant(`${f.month}-10`, 8, 'America/Sao_Paulo');
        let now = new Date(start.getTime() + 30 * 60000);
        const changes = new ReservationChangesService(pool, () => now),
          reservations = new ReservationsService(pool, () => now);
        const body = { requestKey: randomUUID() };
        await expect(
          changes.execute(
            f.users[1]!.accountId,
            f.congregation,
            r.id,
            'leave',
            body,
          ),
        ).rejects.toMatchObject({ status: 409 });
        const left = await changes.execute(
          f.users[2]!.accountId,
          f.congregation,
          r.id,
          'leave',
          body,
        );
        expect(
          await changes.execute(
            f.users[2]!.accountId,
            f.congregation,
            r.id,
            'leave',
            body,
          ),
        ).toEqual(left);
        expect(
          (
            await pool.query(
              'SELECT ends_at FROM reservation_attendance WHERE reservation_id=$1 AND account_id=$2',
              [r.id, f.users[2]!.accountId],
            )
          ).rows[0].ends_at,
        ).toEqual(now);
        const payload = {
          requestKey: randomUUID(),
          pointId: f.point,
          date: `${f.month}-10`,
          startHour: 10,
          duration: 1,
          equipmentType: 'CART',
          thirdPositionOpen: true,
        };
        await reservations.create(
          f.users[2]!.accountId,
          f.congregation,
          payload,
        );
        await expect(
          reservations.create(f.users[2]!.accountId, f.congregation, {
            ...payload,
            requestKey: randomUUID(),
            startHour: 11,
          }),
        ).rejects.toMatchObject({ status: 409 });
        now = new Date(start.getTime() + 90 * 60000);
        await reservations.join(f.users[2]!.accountId, f.congregation, r.id);
        now = new Date(start.getTime() + 105 * 60000);
        await changes.execute(
          f.users[2]!.accountId,
          f.congregation,
          r.id,
          'leave',
          { requestKey: randomUUID() },
        );
        expect(
          (
            await pool.query(
              'SELECT count(*) FROM reservation_attendance WHERE reservation_id=$1 AND account_id=$2',
              [r.id, f.users[2]!.accountId],
            )
          ).rows[0].count,
        ).toBe('2');
        now = new Date(start.getTime() + 2 * 3600000);
        await expect(
          changes.execute(
            f.users[2]!.accountId,
            f.congregation,
            r.id,
            'leave',
            { requestKey: randomUUID() },
          ),
        ).rejects.toMatchObject({ status: 409 });
        const cancel = await f.book(3, { date: `${f.month}-12` });
        const cancelStart = localInstant(
          `${f.month}-12`,
          8,
          'America/Sao_Paulo',
        );
        now = new Date(cancelStart.getTime() + 30 * 60000);
        await changes.execute(
          f.users[3]!.accountId,
          f.congregation,
          cancel.id,
          'cancel',
          { requestKey: randomUUID(), scope: 'date' },
        );
        expect(
          (
            await pool.query(
              'SELECT ends_at FROM reservation_attendance WHERE reservation_id=$1',
              [cancel.id],
            )
          ).rows[0].ends_at,
        ).toEqual(now);
        const future = await f.book(1, { date: `${f.month}-13` });
        await f.request(`reservations/${future.id}/join`, 4);
        await f.request(`schedule/${f.month}/finalize`);
        expect(
          (
            await f.request(`reservations/${future.id}/leave`, 4, {
              requestKey: randomUUID(),
            })
          ).status,
        ).toBe(409);
        await f.request(`schedule/${f.month}/reopen`);
        expect(
          (
            await f.request(`reservations/${future.id}/leave`, 4, {
              requestKey: randomUUID(),
            })
          ).status,
        ).toBe(409);
      } finally {
        await f.app.close();
      }
    });
  }, 120_000);
});
