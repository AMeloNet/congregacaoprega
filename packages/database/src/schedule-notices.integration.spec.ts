import { randomUUID } from 'node:crypto';
import { runPrisma, withDisposableDatabase } from './test-support/database.js';
import { reservationApp } from './test-support/reservation-app.js';
import { ScheduleNoticesService } from '../../../apps/api/src/schedule-notices.service.js';
import { CaptureEmailService } from '../../../apps/api/src/identity/email.service.js';

describe('schedule notice outbox', () => {
  it('persists immediate inbox notices, scopes reading, retries failures and distinguishes capture from delivery without duplicating successful processing', async () => {
    await withDisposableDatabase(async (url, pool) => {
      expect(runPrisma(url, ['migrate', 'deploy'])).toBe(0);
      const f = await reservationApp(pool);
      try {
        const r = await f.book();
        const response = await f.request(
          `reservations/${r.id}/invitations`,
          1,
          {
            requestKey: randomUUID(),
            recipientEmail: 'management-2@example.test',
          },
        );
        expect(response.status).toBe(201);
        const inbox = await (
          await f.request('reservation-inbox', 2, undefined, 'GET')
        ).json();
        expect(inbox.notices).toHaveLength(1);
        const id = inbox.notices[0].id;
        expect((await f.request(`schedule-notices/${id}/read`, 3)).status).toBe(
          404,
        );
        expect((await f.request(`schedule-notices/${id}/read`, 2)).status).toBe(
          201,
        );
        const capture = new CaptureEmailService();
        let fail = true;
        const email = {
          assertAllowedRecipient: (to: string) =>
            capture.assertAllowedRecipient(to),
          send: async (message: Parameters<CaptureEmailService['send']>[0]) => {
            if (fail) throw new Error('Fake transport failure');
            await capture.send(message);
          },
        };
        const now = new Date(Date.now() + 1000);
        const service = new ScheduleNoticesService(pool, email, () => now);
        await service.deliver();
        expect(
          (
            await pool.query(
              'SELECT mail_state,mail_attempts,last_error FROM schedule_notice WHERE id=$1',
              [id],
            )
          ).rows[0],
        ).toEqual({
          mail_state: 'failed',
          mail_attempts: 1,
          last_error: 'Falha no transporte de e-mail.',
        });
        fail = false;
        now.setTime(now.getTime() + 31000);
        await Promise.all([service.deliver(), service.deliver()]);
        expect(capture.messages).toHaveLength(1);
        expect(capture.messages[0]?.template).toBe('schedule-notice');
        const stored = (
          await pool.query(
            'SELECT mail_state,mail_attempts,delivered_at FROM schedule_notice WHERE id=$1',
            [id],
          )
        ).rows[0];
        expect(stored).toEqual({
          mail_state: 'captured',
          mail_attempts: 2,
          delivered_at: null,
        });
        await service.deliver();
        expect(capture.messages).toHaveLength(1);
      } finally {
        await f.app.close();
      }
    });
  }, 120_000);
});
