import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { runPrisma, withDisposableDatabase } from './test-support/database.js';
import { reservationApp } from './test-support/reservation-app.js';
import { ScheduleNoticesService } from '../../../apps/api/src/schedule-notices.service.js';
import { ResendScheduleTransport } from '../../../apps/api/src/schedule-email.transport.js';
import { CaptureEmailService } from '../../../apps/api/src/identity/email.service.js';

describe('schedule email transport and signed delivery', () => {
  it('recovers an uncertain acceptance without duplicate sends, verifies raw webhooks, persists early/replayed events and stops unsafe retries', async () => {
    await withDisposableDatabase(async (url, pool) => {
      expect(runPrisma(url, ['migrate', 'deploy'])).toBe(0);
      const secret = randomBytes(32);
      const f = await reservationApp(pool, {
        transport: 'resend',
        apiKey: 'fake-provider-key',
        from: 'schedule@example.test',
        webhookSecret: `whsec_${secret.toString('base64')}`,
      });
      const now = new Date();
      const webhookUrl = `${await f.app.getUrl()}/api/schedule-email/webhook`;
      const webhook = (
        type: string,
        providerId: string,
        id = randomUUID(),
        corrupt = false,
        age = 0,
      ) => {
        const body = JSON.stringify({
          type,
          created_at: new Date().toISOString(),
          data: { email_id: providerId, to: ['private@example.test'] },
        });
        const timestamp = String(Math.floor(Date.now() / 1000) - age);
        const signature = createHmac('sha256', secret)
          .update(`${id}.${timestamp}.${body}`)
          .digest('base64');
        return fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'svix-id': id,
            'svix-timestamp': timestamp,
            'svix-signature': `v1,invalid v1,${signature}`,
          },
          body: corrupt ? body + ' ' : body,
        });
      };
      const insertNotice = async (event: string) => {
        const id = randomUUID();
        await pool.query(
          'INSERT INTO schedule_notice(id,congregation_id,recipient_account_id,event_key,message,created_at,next_attempt_at) VALUES ($1,$2,$3,$4,$5,$6,$6)',
          [
            id,
            f.congregation,
            f.users[1]!.accountId,
            event,
            'Aviso fictício de programação.',
            now,
          ],
        );
        return id;
      };
      const state = async (id: string) =>
        (await pool.query('SELECT * FROM schedule_notice WHERE id=$1', [id]))
          .rows[0];
      try {
        const id = await insertNotice('uncertain');
        const providerId = randomUUID(),
          eventId = randomUUID();
        expect(
          (
            await fetch(webhookUrl, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: '{}',
            })
          ).status,
        ).toBe(401);
        expect(
          (await webhook('email.delivered', providerId, randomUUID(), true))
            .status,
        ).toBe(401);
        expect(
          (
            await webhook(
              'email.delivered',
              providerId,
              randomUUID(),
              false,
              301,
            )
          ).status,
        ).toBe(401);
        const accepted = new Map<string, string>();
        const payloads: string[] = [];
        let loseResponse = true;
        const provider = vi.fn<typeof fetch>(async (input, options) => {
          expect(input).toBe('https://api.resend.com/emails');
          expect(options?.signal).toBeInstanceOf(AbortSignal);
          const key = (options?.headers as Record<string, string>)[
            'idempotency-key'
          ]!;
          payloads.push(String(options?.body));
          // First-attempt timestamp and immutable payload are durable before I/O.
          expect((await state(id)).first_attempt_at).toBeInstanceOf(Date);
          if (!accepted.has(key)) accepted.set(key, providerId);
          if (loseResponse) {
            loseResponse = false;
            expect(
              (await webhook('email.delivered', providerId, eventId)).status,
            ).toBe(200);
            throw new Error('Simulated lost response after acceptance');
          }
          return new Response(JSON.stringify({ id: accepted.get(key) }));
        });
        const transport = new ResendScheduleTransport(
          'fake-provider-key',
          'schedule@example.test',
          provider,
        );
        const service = new ScheduleNoticesService(pool, transport, () => now);
        await service.deliver(1);
        expect(await state(id)).toMatchObject({
          mail_state: 'failed',
          provider_id: null,
          mail_attempts: 1,
        });
        await pool.query(
          "UPDATE identity_account SET email='changed@example.test' WHERE id=$1",
          [f.users[1]!.accountId],
        );
        now.setTime(now.getTime() + 31_000);
        const changedSender = new ScheduleNoticesService(
          pool,
          new ResendScheduleTransport(
            'fake-provider-key',
            'changed-sender@example.test',
            provider,
          ),
          () => now,
        );
        await Promise.all([changedSender.deliver(1), changedSender.deliver(1)]);
        expect(provider).toHaveBeenCalledTimes(2);
        expect(accepted.size).toBe(1);
        expect(payloads[0]).toBe(payloads[1]);
        expect(payloads[1]).toContain('management-1@example.test');
        expect(await state(id)).toMatchObject({
          mail_state: 'sent',
          provider_id: providerId,
          mail_attempts: 2,
          delivered_at: expect.any(Date),
          next_attempt_at: null,
        });
        expect(
          (await webhook('email.delivered', providerId, eventId)).status,
        ).toBe(200);
        expect(
          (
            await pool.query('SELECT * FROM schedule_mail_event WHERE id=$1', [
              eventId,
            ])
          ).rowCount,
        ).toBe(1);
        expect((await webhook('email.sent', providerId)).status).toBe(200);
        expect((await state(id)).delivered_at).toBeInstanceOf(Date);
        expect((await webhook('email.complained', providerId)).status).toBe(
          200,
        );
        expect(await state(id)).toMatchObject({
          mail_state: 'failed',
          next_attempt_at: null,
          delivered_at: expect.any(Date),
        });
        await service.deliver();
        expect(provider).toHaveBeenCalledTimes(2);

        const second = await insertNotice('accepted-only');
        const secondProvider = randomUUID();
        const acceptedOnly = vi.fn<typeof fetch>(
          async () => new Response(JSON.stringify({ id: secondProvider })),
        );
        const next = new ScheduleNoticesService(
          pool,
          new ResendScheduleTransport(
            'fake-provider-key',
            'schedule@example.test',
            acceptedOnly,
          ),
          () => now,
        );
        await next.deliver(1);
        expect(await state(second)).toMatchObject({
          mail_state: 'sent',
          delivered_at: null,
        });
        await pool.query(
          "UPDATE schedule_notice SET created_at=$2::timestamptz-interval '2 hours' WHERE id=$1",
          [second, new Date()],
        );
        const admin = await (
          await f.request('schedule-alerts', 0, undefined, 'GET')
        ).json();
        expect(admin.mailIssues).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: second,
              overdue: true,
              mailState: 'sent',
            }),
          ]),
        );
        expect((await webhook('email.bounced', secondProvider)).status).toBe(
          200,
        );
        expect(await state(second)).toMatchObject({
          mail_state: 'failed',
          next_attempt_at: null,
        });

        const expired = await insertNotice('expired-key');
        await pool.query(
          "UPDATE schedule_notice SET mail_transport='resend',first_attempt_at=$2::timestamptz-interval '23 hours' WHERE id=$1",
          [expired, now],
        );
        await next.deliver(1);
        expect(await state(expired)).toMatchObject({
          mail_state: 'failed',
          next_attempt_at: null,
        });
        expect(acceptedOnly).toHaveBeenCalledTimes(1);

        const captured = await insertNotice('capture-kept');
        await new ScheduleNoticesService(
          pool,
          new CaptureEmailService(),
          () => now,
        ).deliver(1);
        await next.deliver(1);
        expect(await state(captured)).toMatchObject({
          mail_state: 'captured',
          delivered_at: null,
        });
        expect(acceptedOnly).toHaveBeenCalledTimes(1);
        const switched = await insertNotice('capture-failure');
        await pool.query(
          "UPDATE schedule_notice SET mail_state='failed',mail_transport='capture' WHERE id=$1",
          [switched],
        );
        await next.deliver(1);
        expect(await state(switched)).toMatchObject({
          mail_state: 'failed',
          next_attempt_at: null,
        });
        expect(acceptedOnly).toHaveBeenCalledTimes(1);
      } finally {
        await f.app.close();
      }
    });
  }, 120_000);
});
