import { randomUUID } from 'node:crypto';
import { runPrisma, withDisposableDatabase } from './test-support/database.js';
import { reservationApp } from './test-support/reservation-app.js';
import { ReservationChangesService } from '../../../apps/api/src/reservation-changes.service.js';
import { RecurrenceService } from '../../../apps/api/src/recurrence.service.js';
import {
  MonthlyScheduleService,
  followingMonth,
} from '../../../apps/api/src/monthly-schedule.service.js';
import { localInstant } from '../../../apps/api/src/reservation-time.js';
describe('reservation cancellation', () => {
  it('cancels atomically against invitation acceptance, releases resources, preserves notices and history, and validates the full recurring suffix before stopping it', async () => {
    await withDisposableDatabase(async (url, pool) => {
      expect(runPrisma(url, ['migrate', 'deploy'])).toBe(0);
      const f = await reservationApp(pool);
      try {
        const r = await f.book();
        await f.request(`reservations/${r.id}/join`, 2);
        const i = await (
          await f.request(`reservations/${r.id}/invitations`, 1, {
            requestKey: randomUUID(),
            recipientEmail: 'management-3@example.test',
          })
        ).json();
        const body = { requestKey: randomUUID(), scope: 'date' };
        expect(
          (await f.request(`reservations/${r.id}/cancel`, 4, body)).status,
        ).toBe(403);
        expect(
          (await f.request(`reservations/${r.id}/cancel`, 5, body)).status,
        ).toBe(403);
        expect(
          (
            await f.request(`reservations/${r.id}/cancel`, 1, {
              ...body,
              scope: 'all',
            })
          ).status,
        ).toBe(400);
        const raced = await Promise.all([
          f.request(`reservations/${r.id}/cancel`, 1, body),
          f.request(`reservation-invitations/${i.id}/accept`, 3),
        ]);
        expect(raced[0]!.status).toBe(201);
        const result = await raced[0]!.json();
        expect(
          await (
            await f.request(`reservations/${r.id}/cancel`, 1, body)
          ).json(),
        ).toEqual(result);
        expect(
          (
            await pool.query(
              'SELECT count(*) FROM reservation_participation WHERE reservation_id=$1',
              [r.id],
            )
          ).rows[0].count,
        ).toBe('0');
        expect(
          (await f.request(`reservation-invitations/${i.id}/accept`, 3)).status,
        ).toBe(409);
        expect(
          (
            await pool.query(
              "SELECT count(*) FROM reservation_history WHERE reservation_id=$1 AND action='cancelled'",
              [r.id],
            )
          ).rows[0].count,
        ).toBe('1');
        expect(
          (
            await pool.query(
              'SELECT count(*) FROM schedule_notice WHERE event_key=$1',
              [`reservation-cancelled:${r.id}`],
            )
          ).rows[0].count,
        ).toBe('3');
        const replacement = await f.book(4);
        expect(
          (await f.request(`reservations/${replacement.id}/join`, 2)).status,
        ).toBe(201);
        const source = await f.book(1, { date: `${f.month}-11` });
        const now = localInstant(`${f.month}-09`, 12, 'America/Sao_Paulo');
        const recurrence = new RecurrenceService(pool, () => now);
        const series = await recurrence.activate(
          f.users[1]!.accountId,
          f.congregation,
          source.id,
        );
        const changes = new ReservationChangesService(pool, () => now),
          monthly = new MonthlyScheduleService(pool, () => now);
        const next = followingMonth(f.month);
        await monthly.execute(
          f.users[0]!.accountId,
          f.congregation,
          'finalize',
          next,
        );
        await expect(
          changes.execute(
            f.users[1]!.accountId,
            f.congregation,
            source.id,
            'cancel',
            { requestKey: randomUUID(), scope: 'following' },
          ),
        ).rejects.toMatchObject({ status: 409 });
        expect(
          (
            await pool.query(
              'SELECT cancelled_at FROM reservation WHERE id=$1',
              [source.id],
            )
          ).rows[0].cancelled_at,
        ).toBeNull();
        expect(
          (
            await pool.query(
              'SELECT stopped_at FROM reservation_series WHERE id=$1',
              [series.id],
            )
          ).rows[0].stopped_at,
        ).toBeNull();
        const one = (await changes.execute(
          f.users[1]!.accountId,
          f.congregation,
          source.id,
          'cancel',
          { requestKey: randomUUID(), scope: 'date' },
        )) as { cancelledIds: string[] };
        expect(one.cancelledIds).toEqual([source.id]);
        await recurrence.generateAll();
        expect(
          (
            await pool.query(
              'SELECT stopped_at FROM reservation_series WHERE id=$1',
              [series.id],
            )
          ).rows[0].stopped_at,
        ).toBeNull();
        await monthly.execute(
          f.users[0]!.accountId,
          f.congregation,
          'reopen',
          next,
        );
        const all = (await changes.execute(
          f.users[0]!.accountId,
          f.congregation,
          source.id,
          'cancel',
          { requestKey: randomUUID(), scope: 'following' },
        )) as { stoppedSeriesId: string; cancelledIds: string[] };
        expect(all.stoppedSeriesId).toBe(series.id);
        expect(all.cancelledIds.length).toBeGreaterThan(0);
        expect(
          (
            await pool.query(
              'SELECT count(*) FROM recurrence_occurrence o JOIN reservation r ON r.id=o.reservation_id WHERE o.series_id=$1 AND r.cancelled_at IS NULL',
              [series.id],
            )
          ).rows[0].count,
        ).toBe('0');
      } finally {
        await f.app.close();
      }
    });
  }, 120_000);
});
