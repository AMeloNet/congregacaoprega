import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import {
  confirmParticipant,
  lockReservationOwner,
  reservationAccess,
  uuidPattern,
} from './reservations.service.js';
import {
  assertPublishedMonths,
  unavailable,
} from './reservation-validation.js';
import {
  expireInvitations,
  groupPositions,
  notice,
  recordReservationEvent,
} from './reservation-groups.js';

export class ReservationInvitationsService {
  constructor(
    private readonly pool: Pool,
    private readonly now = () => new Date(),
  ) {}

  async send(
    accountId: string,
    congregationId: string,
    reservationId: string,
    input: unknown,
  ) {
    const body = input as { requestKey: string; recipientEmail: string };
    if (
      !uuidPattern.test(reservationId) ||
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).some(
        (k) => !['requestKey', 'recipientEmail'].includes(k),
      ) ||
      !uuidPattern.test(body.requestKey ?? '') ||
      typeof body.recipientEmail !== 'string' ||
      body.recipientEmail.length > 254 ||
      !/^\S+@\S+\.\S+$/.test(body.recipientEmail.trim())
    )
      throw new BadRequestException(
        'Informe o e-mail do convidado e uma chave válida.',
      );
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const member = await reservationAccess(client, accountId, congregationId);
      const target = (
        await client.query(
          "SELECT a.id FROM identity_account a JOIN membership m ON m.account_id=a.id WHERE lower(a.email)=lower($1) AND m.congregation_id=$2 AND m.status='ACTIVE' AND a.email_verified FOR SHARE OF a,m",
          [body.recipientEmail.trim(), congregationId],
        )
      ).rows;
      if (target.length !== 1)
        throw new NotFoundException(
          'Publicador elegível não encontrado nesta congregação.',
        );
      const recipient = target[0].id;
      await lockReservationOwner(client, recipient);
      const c = (
        await client.query(
          'SELECT timezone FROM congregation WHERE id=$1 FOR UPDATE',
          [congregationId],
        )
      ).rows[0];
      const r = await this.reservation(client, reservationId, congregationId);
      this.manager(accountId, member.role, r.responsible_account_id);
      const now = this.now();
      await this.editable(
        client,
        congregationId,
        c.timezone,
        r,
        now,
        member.role,
      );
      await expireInvitations(client, reservationId, now);
      const previous = (
        await client.query(
          'SELECT * FROM reservation_invitation WHERE reservation_id=$1 AND request_key=$2',
          [reservationId, body.requestKey],
        )
      ).rows[0];
      if (previous) {
        if (previous.recipient_account_id !== recipient)
          throw unavailable('chave já usada para outro convite.');
        await client.query('COMMIT');
        return {
          id: previous.id,
          state: previous.state,
          expiresAt: previous.expires_at,
          position: previous.position,
        };
      }
      const positions = await groupPositions(client, reservationId, now);
      if (
        r.responsible_account_id === recipient ||
        positions.some((p) => p.account_id === recipient)
      )
        throw unavailable(
          'publicador já participa ou tem convite pendente nesta designação.',
        );
      const position = [2, 3].find(
        (p) => !positions.some((o) => o.position === p),
      );
      if (!position) throw unavailable('grupo sem posições livres.');
      const id = randomUUID(),
        expiresAt = this.expires(
          now,
          new Date(r.starts_at),
          new Date(r.ends_at),
        );
      await client.query(
        'INSERT INTO reservation_invitation (id,reservation_id,recipient_account_id,created_by_account_id,request_key,position,expires_at,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          id,
          reservationId,
          recipient,
          accountId,
          body.requestKey,
          position,
          expiresAt,
          now,
        ],
      );
      await recordReservationEvent(
        client,
        reservationId,
        accountId,
        'invitation-created',
        {},
        { id, recipient, position, expiresAt },
      );
      await notice(
        client,
        congregationId,
        [recipient],
        `invitation:${id}`,
        'Você recebeu um convite para uma designação. Consulte Convites e avisos.',
        now,
        reservationId,
      );
      await client.query('COMMIT');
      return { id, state: 'pending', expiresAt, position };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async act(
    accountId: string,
    congregationId: string,
    invitationId: string,
    action: 'accept' | 'decline' | 'revoke' | 'resend',
  ) {
    if (!uuidPattern.test(invitationId))
      throw new BadRequestException('Convite inválido.');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const member = await reservationAccess(client, accountId, congregationId);
      const preliminary = (
        await client.query(
          'SELECT i.* FROM reservation_invitation i JOIN reservation r ON r.id=i.reservation_id WHERE i.id=$1 AND r.congregation_id=$2',
          [invitationId, congregationId],
        )
      ).rows[0];
      if (!preliminary) throw new NotFoundException('Convite não encontrado.');
      if (
        ['accept', 'decline'].includes(action) &&
        preliminary.recipient_account_id !== accountId
      )
        throw new ForbiddenException('Somente o destinatário pode responder.');
      if (action === 'accept' || action === 'resend')
        await reservationAccess(
          client,
          preliminary.recipient_account_id,
          congregationId,
        );
      await lockReservationOwner(client, preliminary.recipient_account_id);
      const c = (
        await client.query(
          'SELECT timezone FROM congregation WHERE id=$1 FOR UPDATE',
          [congregationId],
        )
      ).rows[0];
      const r = await this.reservation(
        client,
        preliminary.reservation_id,
        congregationId,
      );
      if (['revoke', 'resend'].includes(action))
        this.manager(accountId, member.role, r.responsible_account_id);
      const now = this.now();
      await this.editable(
        client,
        congregationId,
        c.timezone,
        r,
        now,
        ['revoke', 'resend'].includes(action) ? member.role : 'PUBLISHER',
      );
      await expireInvitations(client, r.id, now);
      const i = (
        await client.query('SELECT * FROM reservation_invitation WHERE id=$1', [
          invitationId,
        ])
      ).rows[0];
      if (action === 'resend' && i.replaced_by_id) {
        const replacement = (
          await client.query(
            'SELECT id,state,expires_at AS "expiresAt",position FROM reservation_invitation WHERE id=$1',
            [i.replaced_by_id],
          )
        ).rows[0];
        await client.query('COMMIT');
        return replacement;
      }
      if (
        (action === 'accept' && i.state === 'accepted') ||
        (action === 'decline' && i.state === 'declined') ||
        (action === 'revoke' && i.state === 'revoked')
      ) {
        await client.query('COMMIT');
        return { id: i.id, state: i.state };
      }
      if (
        i.state !== 'pending' &&
        !(action === 'resend' && i.state === 'expired')
      )
        throw unavailable('convite encerrado ou expirado.');
      if (action === 'accept') {
        const confirmation = await confirmParticipant(
          client,
          accountId,
          congregationId,
          r,
          c.timezone,
          now,
          { id: i.id, position: i.position },
        );
        await client.query(
          "UPDATE reservation_invitation SET state='accepted',completed_at=$2 WHERE id=$1",
          [i.id, now],
        );
        const refused = (
          await client.query(
            `UPDATE reservation_invitation i SET state='declined',completed_at=$2 FROM reservation other WHERE other.id=i.reservation_id AND i.recipient_account_id=$1 AND i.id<>$3 AND i.state='pending' AND i.expires_at>$2 AND other.cancelled_at IS NULL AND other.starts_at<$5 AND other.ends_at>$4 RETURNING i.id,other.congregation_id,other.responsible_account_id,other.id AS reservation_id`,
            [accountId, now, i.id, confirmation.startsAt, new Date(r.ends_at)],
          )
        ).rows;
        for (const other of refused)
          await notice(
            client,
            other.congregation_id,
            [accountId, other.responsible_account_id],
            `invitation-declined:${other.id}`,
            'Convite recusado automaticamente por conflito com uma participação confirmada.',
            now,
            other.reservation_id,
          );
        await recordReservationEvent(
          client,
          r.id,
          accountId,
          'invitation-accepted',
          { id: i.id },
          {
            id: i.id,
            position: i.position,
            automaticallyDeclined: refused.map((row) => row.id),
          },
        );
        await client.query('COMMIT');
        return { id: i.id, state: 'accepted', ...confirmation };
      }
      if (action === 'resend') {
        const id = randomUUID(),
          expiresAt = this.expires(
            now,
            new Date(r.starts_at),
            new Date(r.ends_at),
          );
        const positions = await groupPositions(client, r.id, now);
        if (
          positions.some(
            (p) =>
              p.kind === 'confirmed' &&
              (p.position === i.position ||
                p.account_id === i.recipient_account_id),
          ) ||
          positions.some(
            (p) =>
              p.kind === 'pending' &&
              ((p.position === i.position &&
                p.account_id !== i.recipient_account_id) ||
                (p.account_id === i.recipient_account_id &&
                  i.state !== 'pending')),
          )
        )
          throw unavailable('posição já ocupada ou novo convite existente.');
        await client.query(
          "UPDATE reservation_invitation SET state='superseded',completed_at=$2 WHERE id=$1",
          [i.id, now],
        );
        await client.query(
          'INSERT INTO reservation_invitation (id,reservation_id,recipient_account_id,created_by_account_id,request_key,position,expires_at,created_at) VALUES ($1,$2,$3,$4,$1,$5,$6,$7)',
          [
            id,
            r.id,
            i.recipient_account_id,
            accountId,
            i.position,
            expiresAt,
            now,
          ],
        );
        await client.query(
          'UPDATE reservation_invitation SET replaced_by_id=$2 WHERE id=$1',
          [i.id, id],
        );
        await notice(
          client,
          congregationId,
          [i.recipient_account_id],
          `invitation:${id}`,
          'Seu convite foi reenviado com novo prazo. O convite anterior perdeu a validade.',
          now,
          r.id,
        );
        await recordReservationEvent(
          client,
          r.id,
          accountId,
          'invitation-resent',
          { id: i.id },
          { id, expiresAt },
        );
        await client.query('COMMIT');
        return { id, state: 'pending', position: i.position, expiresAt };
      }
      const state = action === 'decline' ? 'declined' : 'revoked';
      await client.query(
        'UPDATE reservation_invitation SET state=$2,completed_at=$3 WHERE id=$1',
        [i.id, state, now],
      );
      await notice(
        client,
        congregationId,
        [r.responsible_account_id, i.recipient_account_id],
        `invitation-${state}:${i.id}`,
        state === 'declined'
          ? 'Convite recusado. A posição foi liberada.'
          : 'Convite retirado pelo responsável ou administrador.',
        now,
        r.id,
      );
      await recordReservationEvent(
        client,
        r.id,
        accountId,
        `invitation-${state}`,
        { id: i.id, state: i.state },
        { id: i.id, state },
      );
      await client.query('COMMIT');
      return { id: i.id, state };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async inbox(accountId: string, congregationId: string) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await reservationAccess(client, accountId, congregationId);
      const invitations = (
        await client.query(
          `SELECT i.id,i.reservation_id AS "reservationId",CASE WHEN i.state='pending' AND i.expires_at<=$3 THEN 'expired' ELSE i.state END AS state,i.expires_at AS "expiresAt",r.local_date AS date,r.start_hour AS "startHour",r.duration,p.name AS "pointName" FROM reservation_invitation i JOIN reservation r ON r.id=i.reservation_id JOIN preaching_point p ON p.id=r.point_id WHERE r.congregation_id=$1 AND i.recipient_account_id=$2 ORDER BY i.created_at DESC,i.id`,
          [congregationId, accountId, this.now()],
        )
      ).rows;
      const notices = (
        await client.query(
          'SELECT id,message,created_at AS "createdAt",read_at AS "readAt",mail_state AS "mailState",delivered_at AS "deliveredAt" FROM schedule_notice WHERE congregation_id=$1 AND recipient_account_id=$2 ORDER BY created_at DESC,id',
          [congregationId, accountId],
        )
      ).rows;
      await client.query('COMMIT');
      return { invitations, notices };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private expires(now: Date, start: Date, end: Date) {
    return new Date(
      Math.min(
        now.getTime() + 24 * 3600000,
        (start > now ? start : end).getTime(),
      ),
    );
  }
  private manager(accountId: string, role: string, owner: string) {
    if (accountId !== owner && role !== 'LOCAL_ADMIN')
      throw new ForbiddenException(
        'Somente o responsável ou administrador pode gerenciar convites.',
      );
  }
  private async reservation(
    client: PoolClient,
    id: string,
    congregationId: string,
  ) {
    const r = (
      await client.query(
        'SELECT * FROM reservation WHERE id=$1 AND congregation_id=$2',
        [id, congregationId],
      )
    ).rows[0];
    if (!r) throw new NotFoundException('Reserva não encontrada.');
    return r;
  }
  private async editable(
    client: PoolClient,
    congregationId: string,
    timezone: string,
    r: { cancelled_at: Date | null; starts_at: Date; ends_at: Date },
    now: Date,
    role: string,
  ) {
    if (r.cancelled_at || new Date(r.ends_at) <= now)
      throw unavailable('reserva cancelada ou encerrada.');
    await assertPublishedMonths(
      client,
      congregationId,
      timezone,
      new Date(r.starts_at),
      new Date(r.ends_at),
      now,
      role === 'LOCAL_ADMIN',
    );
  }
}
