import { NotFoundException, BadRequestException } from '@nestjs/common';
import type { Pool } from 'pg';
import type { EmailService } from './identity/email.service.js';
import { reservationAccess, uuidPattern } from './reservations.service.js';
import { expireInvitations } from './reservation-groups.js';
import { ScheduleAlertsService } from './schedule-alerts.service.js';

export class ScheduleNoticesService {
  constructor(
    private readonly pool: Pool,
    private readonly email: EmailService,
    private readonly now = () => new Date(),
  ) {}
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
      try {
        await client.query('BEGIN');
        const now = this.now();
        const n = (
          await client.query(
            "SELECT n.*,a.email FROM schedule_notice n JOIN identity_account a ON a.id=n.recipient_account_id WHERE n.mail_state IN('pending','failed') AND n.next_attempt_at<=$1 ORDER BY n.created_at,n.id LIMIT 1 FOR UPDATE OF n SKIP LOCKED",
            [now],
          )
        ).rows[0];
        if (!n) {
          await client.query('COMMIT');
          return;
        }
        try {
          await this.email.send({
            to: n.email,
            template: 'schedule-notice',
            parameters: { noticeId: n.id, message: n.message },
          });
          // Capture is evidence of local processing, never of external delivery.
          await client.query(
            "UPDATE schedule_notice SET mail_state='captured',mail_attempts=mail_attempts+1,last_error=NULL WHERE id=$1",
            [n.id],
          );
        } catch {
          const delay = Math.min(
            15 * 60000,
            30000 * 2 ** Math.min(n.mail_attempts, 5),
          );
          await client.query(
            "UPDATE schedule_notice SET mail_state='failed',mail_attempts=mail_attempts+1,last_error='Falha no transporte de e-mail.',next_attempt_at=$2 WHERE id=$1",
            [n.id, new Date(now.getTime() + delay)],
          );
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
  }
  async process() {
    await this.expire();
    await new ScheduleAlertsService(this.pool, this.now).process();
    await this.deliver();
  }
}
