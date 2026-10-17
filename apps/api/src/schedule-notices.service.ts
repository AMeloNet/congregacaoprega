import { NotFoundException, BadRequestException } from '@nestjs/common';
import type { Pool } from 'pg';
import type { EmailService } from './identity/email.service.js';
import { reservationAccess, uuidPattern } from './reservations.service.js';
import { expireInvitations } from './reservation-groups.js';
import { ScheduleAlertsService } from './schedule-alerts.service.js';
import {
  CaptureScheduleTransport,
  type ScheduleMailTransport,
} from './schedule-email.transport.js';
import { reconcileScheduleMail } from './schedule-email-events.service.js';

export class ScheduleNoticesService {
  private readonly transport: ScheduleMailTransport;
  constructor(
    private readonly pool: Pool,
    email: EmailService | ScheduleMailTransport,
    private readonly now = () => new Date(),
  ) {
    this.transport =
      'name' in email ? email : new CaptureScheduleTransport(email);
  }
  async read(accountId: string, congregationId: string, id: string) {
    if (!uuidPattern.test(id)) throw new BadRequestException('Aviso inválido.');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await reservationAccess(client, accountId, congregationId);
      const updated = await client.query(
        'UPDATE schedule_notice SET read_at=coalesce(read_at,$4) WHERE id=$1 AND congregation_id=$2 AND recipient_account_id=$3 RETURNING id',
        [id, congregationId, accountId, this.now()],
      );
      if (!updated.rowCount)
        throw new NotFoundException('Aviso não encontrado.');
      await client.query('COMMIT');
      return { id, read: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async expire() {
    const due = (
      await this.pool.query(
        "SELECT DISTINCT r.id,r.congregation_id FROM reservation_invitation i JOIN reservation r ON r.id=i.reservation_id WHERE i.state='pending' AND i.expires_at<=$1 ORDER BY r.congregation_id,r.id",
        [this.now()],
      )
    ).rows;
    for (const r of due) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          'SELECT id FROM congregation WHERE id=$1 FOR UPDATE',
          [r.congregation_id],
        );
        await expireInvitations(client, r.id, this.now());
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
  }
  async deliver(limit = 50) {
    for (let index = 0; index < limit; index++) {
      const client = await this.pool.connect();
      let n;
      try {
        await client.query('BEGIN');
        const now = this.now();
        n = (
          await client.query(
            "SELECT n.*,a.email FROM schedule_notice n JOIN identity_account a ON a.id=n.recipient_account_id WHERE n.mail_state IN('pending','failed') AND n.next_attempt_at<=$1 ORDER BY n.created_at,n.id LIMIT 1 FOR UPDATE OF n SKIP LOCKED",
            [now],
          )
        ).rows[0];
        if (!n) {
          await client.query('COMMIT');
          return;
        }
        if (
          (n.mail_transport && n.mail_transport !== this.transport.name) ||
          (n.mail_transport === 'resend' &&
            n.first_attempt_at &&
            now.getTime() - n.first_attempt_at.getTime() >= 23 * 3600_000)
        ) {
          await client.query(
            "UPDATE schedule_notice SET mail_state='failed',next_attempt_at=NULL,last_error='Reenvio automático interrompido: transporte alterado ou janela de idempotência encerrada. Verifique no provedor.' WHERE id=$1",
            [n.id],
          );
          await client.query('COMMIT');
          continue;
        }
        // A durable lease and immutable envelope must precede the external call.
        // A crash can replay only this payload/key, within the provider window.
        let payload = n.mail_payload;
        try {
          payload ??= this.transport.prepare({
            to: n.email,
            template: 'schedule-notice',
            parameters: { noticeId: n.id, message: n.message },
          });
        } catch {
          await client.query(
            "UPDATE schedule_notice SET mail_state='failed',next_attempt_at=NULL,last_error='Aviso ou destinatário inválido para o transporte. Revisão necessária.' WHERE id=$1",
            [n.id],
          );
          await client.query('COMMIT');
          continue;
        }
        await client.query(
          "UPDATE schedule_notice SET mail_transport=$2,mail_payload=$3,first_attempt_at=coalesce(first_attempt_at,$4),mail_attempts=mail_attempts+1,mail_state='pending',next_attempt_at=$5 WHERE id=$1",
          [
            n.id,
            this.transport.name,
            JSON.stringify(payload),
            now,
            new Date(now.getTime() + 60_000),
          ],
        );
        await client.query('COMMIT');
        n.mail_payload = payload;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      try {
        const providerId = await this.transport.sendPrepared(
          n.mail_payload,
          n.id,
        );
        await this.pool.query(
          'UPDATE schedule_notice SET mail_state=$2,provider_id=$3,next_attempt_at=NULL,last_error=NULL WHERE id=$1 AND provider_id IS NULL',
          [n.id, providerId ? 'sent' : 'captured', providerId],
        );
        await reconcileScheduleMail(this.pool);
      } catch {
        const delay = Math.min(
          15 * 60000,
          30000 * 2 ** Math.min(n.mail_attempts, 5),
        );
        await this.pool.query(
          "UPDATE schedule_notice SET mail_state='failed',last_error='Falha no transporte de e-mail.',next_attempt_at=$2 WHERE id=$1 AND provider_id IS NULL",
          [n.id, new Date(this.now().getTime() + delay)],
        );
      }
    }
  }
  async process() {
    await this.expire();
    await new ScheduleAlertsService(this.pool, this.now).process();
    await this.deliver();
    await reconcileScheduleMail(this.pool);
  }
}
