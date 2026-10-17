import { randomUUID } from 'node:crypto';
import { runPrisma, withDisposableDatabase } from './test-support/database.js';
import { reservationApp } from './test-support/reservation-app.js';
import { ReservationAdministrationService } from '../../../apps/api/src/reservation-administration.service.js';
import { ReservationsService } from '../../../apps/api/src/reservations.service.js';
import { localInstant } from '../../../apps/api/src/reservation-time.js';
describe('reservation administration', () => {
  it('limits administrative actions, enforces stale-state and monthly locks, includes within capacity and transfers only to a confirmed participant while removing the old owner and preserving recurrence and creation identity', async () => {
    await withDisposableDatabase(async (url, pool) => {
      expect(runPrisma(url, ['migrate', 'deploy'])).toBe(0);
      const f = await reservationApp(pool);
      try {
        const r = await f.book();
        const stored = (
          await pool.query('SELECT * FROM reservation WHERE id=$1', [r.id])
        ).rows[0];
        const detail = async () =>
          await (
            await f.request(`reservations/${r.id}`, 0, undefined, 'GET')
          ).json();
        const act = async (
          action: string,
          target: number,
          index = 0,
          revision?: string,
        ) =>
          f.request(`reservations/${r.id}/administration`, index, {
            requestKey: randomUUID(),
            revision: revision ?? (await detail()).revision,
            action,
            accountId: f.users[target]!.accountId,
          });
        expect((await act('include', 2, 1)).status).toBe(403);
        expect((await act('include', 5)).status).toBe(403);
        expect((await act('reschedule', 2)).status).toBe(400);
        const before = await detail();
        await f.request(
          `reservations/${r.id}/third-position`,
          1,
          { open: false },
          'PUT',
        );
        expect((await act('include', 2, 0, before.revision)).status).toBe(409);
        expect((await act('include', 2)).status).toBe(201);
        expect((await act('include', 3)).status).toBe(201);
        expect((await act('include', 4)).status).toBe(409);
        await f.request(
          `reservations/${r.id}/third-position`,
          1,
          { open: true },
          'PUT',
        ); // occupied: rejects without removing anyone
        const series = await (
          await f.request(`reservations/${r.id}/recurrence`, 1)
        ).json();
        expect(series.id).toEqual(expect.any(String));
        const payload = {
          requestKey: randomUUID(),
          revision: (await detail()).revision,
          action: 'responsible',
          accountId: f.users[2]!.accountId,
        };
        const response = await f.request(
          `reservations/${r.id}/administration`,
          0,
          payload,
        );
        expect(response.status).toBe(201);
        expect(
          await (
            await f.request(`reservations/${r.id}/administration`, 0, payload)
          ).json(),
        ).toEqual(await response.json());
        const roster = await detail();
        expect(
          roster.participants.map((p: { accountId: string }) => p.accountId),
        ).not.toContain(f.users[1]!.accountId);
        expect(
          roster.participants.find(
            (p: { position: number }) => p.position === 1,
          ).accountId,
        ).toBe(f.users[2]!.accountId);
        expect(
          (
            await pool.query(
              'SELECT configuration FROM reservation_series WHERE id=$1',
              [series.id],
            )
          ).rows[0].configuration.responsible_account_id,
        ).toBe(f.users[1]!.accountId);
        expect(
          (
            await pool.query(
              'SELECT starts_at=ends_at AS empty FROM reservation_attendance WHERE reservation_id=$1 AND account_id=$2',
              [r.id, f.users[1]!.accountId],
            )
          ).rows[0].empty,
        ).toBe(true);
        const replay = await new ReservationsService(pool).create(
          f.users[1]!.accountId,
          f.congregation,
          {
            requestKey: stored.request_key,
            pointId: f.point,
            date: stored.local_date,
            startHour: stored.start_hour,
            duration: stored.duration,
            equipmentType: stored.equipment_type,
            thirdPositionOpen: false,
          },
        );
        expect(replay.id).toBe(r.id);
        await pool.query(
          "UPDATE membership SET status='REVOKED',revoked_at=now() WHERE account_id=$1",
          [f.users[3]!.accountId],
        );
        expect((await act('remove', 3)).status).toBe(201);
        const late = await f.book(1, { date: `${f.month}-20` });
        await f.request(`schedule/${f.month}/finalize`);
        expect((await act('include', 4)).status).toBe(409);
        await f.request(`schedule/${f.month}/reopen`);
        expect((await act('include', 4)).status).toBe(201);
        const start = localInstant(`${f.month}-20`, 8, 'America/Sao_Paulo');
        await expect(
          new ReservationsService(
            pool,
            () => new Date(start.getTime() + 30 * 60000),
          ).join(f.users[2]!.accountId, f.congregation, late.id),
        ).rejects.toMatchObject({ status: 409 });
        // The month is reopened, so use the directed admin operation for a late participant.
        const now = new Date(start.getTime() + 30 * 60000),
          admin = new ReservationAdministrationService(pool, () => now);
        const lateDetail = await admin.detail(
          f.users[0]!.accountId,
          f.congregation,
          late.id,
        );
        await admin.execute(f.users[0]!.accountId, f.congregation, late.id, {
          requestKey: randomUUID(),
          revision: lateDetail.revision,
          action: 'include',
          accountId: f.users[2]!.accountId,
        });
        now.setTime(now.getTime() + 15 * 60000);
        const current = await admin.detail(
          f.users[0]!.accountId,
          f.congregation,
          late.id,
        );
        await admin.execute(f.users[0]!.accountId, f.congregation, late.id, {
          requestKey: randomUUID(),
          revision: current.revision,
          action: 'responsible',
          accountId: f.users[2]!.accountId,
        });
        expect(
          (
            await pool.query(
              'SELECT ends_at FROM reservation_attendance WHERE reservation_id=$1 AND account_id=$2',
              [late.id, f.users[1]!.accountId],
            )
          ).rows[0].ends_at,
        ).toEqual(now);
        expect(
          (
            await pool.query(
              'SELECT starts_at FROM reservation_attendance WHERE reservation_id=$1 AND account_id=$2',
              [late.id, f.users[2]!.accountId],
            )
          ).rows[0].starts_at,
        ).toEqual(new Date(start.getTime() + 30 * 60000));
      } finally {
        await f.app.close();
      }
    });
  }, 120_000);
});
