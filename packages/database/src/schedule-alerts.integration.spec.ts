import { runPrisma, withDisposableDatabase } from './test-support/database.js';
import { reservationApp } from './test-support/reservation-app.js';
import { ScheduleAlertsService } from '../../../apps/api/src/schedule-alerts.service.js';
import { localInstant } from '../../../apps/api/src/reservation-time.js';
describe('administrative schedule alerts', () => {
  it('requires selected eligible administrators, records minimum at original start once, retains reservations and reports mail delays honestly', async () => {
    await withDisposableDatabase(async (url, pool) => {
      expect(runPrisma(url, ['migrate', 'deploy'])).toBe(0);
      const f = await reservationApp(pool);
      try {
        expect(
          (await f.request('schedule-alerts', 1, undefined, 'GET')).status,
        ).toBe(403);
        expect(
          (
            await f.request(
              'schedule-alerts',
              0,
              { accountIds: [f.users[1]!.accountId] },
              'PUT',
            )
          ).status,
        ).toBe(400);
        const r = await f.book(),
          full = await f.book(1, { startHour: 10 });
        await f.request(`reservations/${full.id}/join`, 2);
        const now = localInstant(`${f.month}-10`, 10, 'America/Sao_Paulo');
        const alerts = new ScheduleAlertsService(pool, () => now);
        await alerts.process();
        let view = await alerts.settings(f.users[0]!.accountId, f.congregation);
        expect(view.selected).toEqual([]);
        expect(view.alerts.map((a) => a.id)).toEqual([r.id]);
        await alerts.settings(f.users[0]!.accountId, f.congregation, {
          accountIds: [f.users[0]!.accountId],
        });
        await Promise.all([alerts.process(), alerts.process()]);
        expect(
          (
            await pool.query(
              'SELECT count(*) FROM schedule_notice WHERE event_key=$1',
              [`minimum-at-start:${r.id}`],
            )
          ).rows[0].count,
        ).toBe('1');
        expect(
          (
            await pool.query(
              'SELECT cancelled_at FROM reservation WHERE id=$1',
              [r.id],
            )
          ).rows[0].cancelled_at,
        ).toBeNull();
        expect(
          (
            await pool.query(
              'SELECT confirmed_at_start FROM reservation_alert WHERE reservation_id=$1',
              [full.id],
            )
          ).rows[0].confirmed_at_start,
        ).toBe(2);
        view = await alerts.settings(f.users[0]!.accountId, f.congregation);
        expect(view.selected).toEqual([f.users[0]!.accountId]);
        expect(view.mailIssues.some((i) => i.overdue)).toBe(true);
      } finally {
        await f.app.close();
      }
    });
  }, 120_000);
});
