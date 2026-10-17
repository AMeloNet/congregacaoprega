import { createHmac, timingSafeEqual } from 'node:crypto';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { uuidPattern } from './reservations.service.js';

const failures = [
  'email.bounced',
  'email.complained',
  'email.failed',
  'email.suppressed',
];
const supported = new Set([
  ...failures,
  'email.sent',
  'email.delivered',
  'email.delivery_delayed',
]);

// Recompute from all stored events, never from webhook arrival order. A late
// acceptance cannot erase a delivery or a permanent failure. No provider error
// text, raw payload, recipient address or secret is persisted in the event log.
export async function reconcileScheduleMail(client: Pool | PoolClient) {
  await client.query(`
    UPDATE schedule_notice n SET
      delivered_at=least(n.delivered_at,e.delivered_at),
      mail_state=CASE WHEN e.failed OR n.mail_state='failed' THEN 'failed' ELSE 'sent' END,
      next_attempt_at=NULL,
      last_error=CASE WHEN e.failed OR n.mail_state='failed' THEN 'O provedor informou falha definitiva ou reclamação. Verifique o aviso no provedor.' ELSE NULL END
    FROM (
      SELECT provider_id, min(occurred_at) FILTER(WHERE event_type='email.delivered') AS delivered_at,
        bool_or(event_type IN ('email.bounced','email.complained','email.failed','email.suppressed')) AS failed
      FROM schedule_mail_event GROUP BY provider_id
    ) e WHERE n.provider_id=e.provider_id AND n.mail_transport='resend'
  `);
}

export class ScheduleEmailEventsService {
  constructor(
    private readonly pool: Pool,
    private readonly secret: string,
    private readonly now = () => new Date(),
  ) {}
  async receive(
    body: Buffer | undefined,
    headers: Record<string, string | string[] | undefined>,
  ) {
    const id = headers['svix-id'],
      timestamp = headers['svix-timestamp'],
      signatures = headers['svix-signature'];
    if (
      !body ||
      typeof id !== 'string' ||
      id.length > 200 ||
      !id ||
      typeof timestamp !== 'string' ||
      !/^\d{1,12}$/.test(timestamp) ||
      Math.abs(Number(timestamp) * 1000 - this.now().getTime()) > 300_000 ||
      typeof signatures !== 'string' ||
      signatures.length > 2000
    )
      throw new UnauthorizedException('Assinatura de e-mail inválida.');
    const expected = createHmac(
      'sha256',
      Buffer.from(this.secret.slice(6), 'base64'),
    )
      .update(`${id}.${timestamp}.`)
      .update(body)
      .digest();
    if (
      !signatures.split(' ').some((item) => {
        const [version, value] = item.split(',');
        if (version !== 'v1' || !value) return false;
        const actual = Buffer.from(value, 'base64');
        return (
          actual.length === expected.length && timingSafeEqual(actual, expected)
        );
      })
    )
      throw new UnauthorizedException('Assinatura de e-mail inválida.');
    let event;
    try {
      event = JSON.parse(body.toString('utf8'));
    } catch {
      throw new BadRequestException('Evento de e-mail inválido.');
    }
    if (!event || typeof event.type !== 'string')
      throw new BadRequestException('Evento de e-mail inválido.');
    if (!supported.has(event.type)) return { received: true };
    const providerId = event.data?.email_id;
    const occurredAt = new Date(event.created_at);
    if (
      typeof providerId !== 'string' ||
      !uuidPattern.test(providerId) ||
      typeof event.created_at !== 'string' ||
      !Number.isFinite(occurredAt.getTime()) ||
      occurredAt.getTime() > this.now().getTime() + 300_000
    )
      throw new BadRequestException('Evento de e-mail inválido.');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'INSERT INTO schedule_mail_event(id,provider_id,event_type,occurred_at) VALUES ($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING',
        [id, providerId, event.type, occurredAt],
      );
      await reconcileScheduleMail(client);
      await client.query('COMMIT');
      return { received: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
