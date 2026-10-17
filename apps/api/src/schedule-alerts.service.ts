import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { reservationAccess, uuidPattern } from './reservations.service.js';
import { alertRecipients, notice } from './reservation-groups.js';

export class ScheduleAlertsService {
  constructor(
    private readonly pool: Pool,
    private readonly now = () => new Date(),
  ) {}
  async settings(accountId: string, congregationId: string, input?: unknown) {
    const body = input as { accountIds: string[] };
    if (
      input !== undefined &&
      (!body ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        Object.keys(body).length !== 1 ||
        !Array.isArray(body.accountIds) ||
        body.accountIds.length < 1 ||
        body.accountIds.length > 100 ||
        body.accountIds.some((id) => !uuidPattern.test(id)) ||
        new Set(body.accountIds).size !== body.accountIds.length)
    )
      throw new BadRequestException(
        'Selecione um ou mais administradores, sem repetições.',
      );
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const member = await reservationAccess(client, accountId, congregationId);
      if (member.role !== 'LOCAL_ADMIN')
        throw new ForbiddenException('Acesso restrito ao administrador local.');
      const administrators = (
        await client.query(
          "SELECT a.id,a.email FROM membership m JOIN identity_account a ON a.id=m.account_id WHERE m.congregation_id=$1 AND m.role='LOCAL_ADMIN' AND m.status='ACTIVE' AND a.email_verified ORDER BY a.id FOR SHARE OF a,m",
          [congregationId],
        )
      ).rows;
      if (
        input !== undefined &&
        body.accountIds.some((id) => !administrators.some((a) => a.id === id))
      )
        throw new BadRequestException(
          'Os destinatários precisam ser administradores elegíveis da congregação.',
        );
      await client.query('SELECT id FROM congregation WHERE id=$1 FOR UPDATE', [
        congregationId,
      ]);
      if (input !== undefined) {
        await client.query(
          'DELETE FROM schedule_alert_recipient WHERE congregation_id=$1',
          [congregationId],
        );
        for (const id of body.accountIds)
          await client.query(
            'INSERT INTO schedule_alert_recipient (congregation_id,account_id) VALUES ($1,$2)',
            [congregationId, id],
          );
        await this.notifyExisting(client, congregationId, this.now());
      }
      const selected = await alertRecipients(client, congregationId);
      const alerts = (
        await client.query(
          'SELECT r.id,r.local_date AS date,r.start_hour AS "startHour",p.name AS "pointName",a.confirmed_at_start AS "confirmedAtStart",a.raised_at AS "raisedAt",r.cancelled_at AS "cancelledAt" FROM reservation_alert a JOIN reservation r ON r.id=a.reservation_id JOIN preaching_point p ON p.id=r.point_id WHERE r.congregation_id=$1 AND a.confirmed_at_start<2 ORDER BY r.starts_at DESC,r.id',
          [congregationId],
        )
      ).rows;
      const mailIssues = (
        await client.query(
          'SELECT id,mail_state AS "mailState",created_at AS "createdAt",mail_attempts AS attempts,delivered_at AS "deliveredAt",(created_at<=$2::timestamptz-interval \'1 hour\' AND delivered_at IS NULL) AS overdue FROM schedule_notice WHERE congregation_id=$1 AND (mail_state=\'failed\' OR (created_at<=$2::timestamptz-interval \'1 hour\' AND delivered_at IS NULL)) ORDER BY created_at,id',
          [congregationId, this.now()],
        )
      ).rows;
      await client.query('COMMIT');
      return { administrators, selected, alerts, mailIssues };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  private async notifyExisting(
    client: PoolClient,
    congregationId: string,
    now: Date,
  ) {
    const recipients = await alertRecipients(client, congregationId);
    const alerts = (
      await client.query(
        'SELECT r.id FROM reservation_alert a JOIN reservation r ON r.id=a.reservation_id WHERE r.congregation_id=$1 AND a.confirmed_at_start<2',
        [congregationId],
      )
    ).rows;
    for (const r of alerts)
      await notice(
        client,
        congregationId,
        recipients,
        `minimum-at-start:${r.id}`,
        'Uma designação iniciou com menos de duas pessoas confirmadas. A reserva foi mantida para decisão administrativa.',
        now,
      );
  }
  async process() {
    const congregations = (
      await this.pool.query(
        'SELECT DISTINCT congregation_id FROM reservation r WHERE r.starts_at<=$1 AND r.cancelled_at IS NULL AND NOT EXISTS(SELECT 1 FROM reservation_alert a WHERE a.reservation_id=r.id) ORDER BY congregation_id',
        [this.now()],
      )
    ).rows;
    for (const congregation of congregations) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          'SELECT id FROM congregation WHERE id=$1 FOR UPDATE',
          [congregation.congregation_id],
        );
        const due = (
          await client.query(
            `SELECT r.id,(SELECT count(DISTINCT a.account_id)::int FROM reservation_attendance a WHERE a.reservation_id=r.id AND a.starts_at<=r.starts_at AND a.ends_at>r.starts_at) AS confirmed FROM reservation r WHERE r.congregation_id=$1 AND r.starts_at<=$2 AND r.cancelled_at IS NULL AND NOT EXISTS(SELECT 1 FROM reservation_alert alert WHERE alert.reservation_id=r.id)`,
            [congregation.congregation_id, this.now()],
          )
        ).rows;
        for (const r of due)
          await client.query(
            'INSERT INTO reservation_alert (reservation_id,confirmed_at_start,raised_at) VALUES ($1,$2,$3) ON CONFLICT (reservation_id) DO NOTHING',
            [r.id, r.confirmed, this.now()],
          );
        await this.notifyExisting(
          client,
          congregation.congregation_id,
          this.now(),
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
  }
}
