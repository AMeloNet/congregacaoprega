import type { Pool } from 'pg';
import type { CapturedEmail } from './email.service.js';
import {
  CaptureInvitationTransport,
  type InvitationMailPayload,
  type InvitationMailTransport,
} from './invitation-email.transport.js';
import type { EmailService } from './email.service.js';

export type InvitationMailStatus =
  'pending' | 'captured' | 'sent' | 'failed' | 'superseded';

export class InvitationEmailService {
  private readonly transport: InvitationMailTransport;
  constructor(
    private readonly pool: Pool,
    transport: InvitationMailTransport | EmailService,
    private readonly now = () => new Date(),
  ) {
    this.transport =
      'name' in transport
        ? transport
        : new CaptureInvitationTransport(transport);
  }

  async deliver(limit = 50) {
    for (let index = 0; index < limit; index += 1) {
      const client = await this.pool.connect();
      let row:
        | {
            id: string;
            mail_envelope: CapturedEmail;
            mail_payload: InvitationMailPayload | null;
            mail_attempts: number;
            mail_transport: 'capture' | 'resend' | null;
            first_attempt_at: Date | null;
          }
        | undefined;
      try {
        await client.query('BEGIN');
        const now = this.now();
        row = (
          await client.query<{
            id: string;
            mail_envelope: CapturedEmail;
            mail_payload: InvitationMailPayload | null;
            mail_attempts: number;
            mail_transport: 'capture' | 'resend' | null;
            first_attempt_at: Date | null;
          }>(
            `SELECT i.id,m.mail_envelope,m.mail_payload,m.mail_attempts,m.mail_transport,m.first_attempt_at
             FROM access_invitation_mail m JOIN access_invitation i ON i.id=m.invitation_id
             WHERE m.mail_state IN ('pending','failed') AND m.next_attempt_at <= $1
             ORDER BY m.created_at,i.id LIMIT 1 FOR UPDATE OF m,i SKIP LOCKED`,
            [now],
          )
        ).rows[0];
        if (!row) {
          await client.query('COMMIT');
          return;
        }
        if (
          (row.mail_transport && row.mail_transport !== this.transport.name) ||
          (row.mail_transport === 'resend' &&
            row.first_attempt_at &&
            now.getTime() - row.first_attempt_at.getTime() >= 23 * 60 * 60_000)
        ) {
          await client.query(
            `UPDATE access_invitation_mail SET mail_state='failed',next_attempt_at=NULL,
             last_error='Reenvio automático interrompido: transporte alterado ou janela de idempotência encerrada. Verifique no provedor.'
             WHERE invitation_id=$1`,
            [row.id],
          );
          await client.query('COMMIT');
          continue;
        }
        if (
          row.mail_envelope === undefined ||
          (
            await client.query<{ status: string }>(
              'SELECT status FROM access_invitation WHERE id=$1',
              [row.id],
            )
          ).rows[0]?.status !== 'PENDING'
        ) {
          await client.query(
            "UPDATE access_invitation_mail SET mail_state='superseded',next_attempt_at=NULL,last_error=NULL WHERE invitation_id=$1",
            [row.id],
          );
          await client.query('COMMIT');
          continue;
        }
        let payload = row.mail_payload;
        try {
          payload ??= this.transport.prepare(row.mail_envelope);
        } catch {
          await client.query(
            "UPDATE access_invitation_mail SET mail_state='failed',next_attempt_at=NULL,last_error='Convite ou destinatário inválido para o transporte. Revisão necessária.' WHERE invitation_id=$1",
            [row.id],
          );
          await client.query('COMMIT');
          continue;
        }
        await client.query(
          `UPDATE access_invitation_mail SET mail_transport=$2,mail_payload=$3,
             first_attempt_at=coalesce(first_attempt_at,$4),mail_attempts=mail_attempts+1,
             mail_state='pending',next_attempt_at=$5 WHERE invitation_id=$1`,
          [
            row.id,
            this.transport.name,
            JSON.stringify(payload),
            now,
            new Date(now.getTime() + 60_000),
          ],
        );
        await client.query('COMMIT');
        row.mail_payload = payload;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      try {
        const providerId = await this.transport.sendPrepared(
          row.mail_payload!,
          row.id,
        );
        await this.pool.query(
          `UPDATE access_invitation_mail SET mail_state=$2,provider_id=$3,
           next_attempt_at=NULL,last_error=NULL WHERE invitation_id=$1 AND provider_id IS NULL`,
          [row.id, providerId ? 'sent' : 'captured', providerId],
        );
      } catch {
        const delay = Math.min(
          15 * 60_000,
          30_000 * 2 ** Math.min(row.mail_attempts, 5),
        );
        await this.pool.query(
          `UPDATE access_invitation_mail SET mail_state='failed',
           last_error='Falha no transporte de e-mail.',next_attempt_at=$2
           WHERE invitation_id=$1 AND provider_id IS NULL`,
          [row.id, new Date(this.now().getTime() + delay)],
        );
      }
    }
  }
}
