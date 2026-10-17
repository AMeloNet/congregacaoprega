import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { Pool } from 'pg';
import {
  lockReservationOwner,
  reservationAccess,
  uuidPattern,
} from './reservations.service.js';
import {
  assertPublishedMonths,
  unavailable,
} from './reservation-validation.js';
import {
  alertRecipients,
  notice,
  recordReservationEvent,
} from './reservation-groups.js';

export class ReservationChangesService {
  constructor(
    private readonly pool: Pool,
    private readonly now = () => new Date(),
  ) {}
  async execute(
    accountId: string,
    congregationId: string,
    reservationId: string,
    action: 'cancel' | 'leave',
    input: unknown,
  ) {
    const body = input as { requestKey: string; scope?: 'date' | 'following' };
    if (
      !uuidPattern.test(reservationId) ||
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      !uuidPattern.test(body.requestKey ?? '') ||
      Object.keys(body).some(
        (key) =>
          !['requestKey', ...(action === 'cancel' ? ['scope'] : [])].includes(
            key,
          ),
      ) ||
      (action === 'cancel' && !['date', 'following'].includes(body.scope ?? ''))
    )
      throw new BadRequestException(
        'Informe uma chave válida e, no cancelamento, escolha somente a data ou também as próximas.',
      );
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const member = await reservationAccess(client, accountId, congregationId);
      if (action === 'leave') await lockReservationOwner(client, accountId);
      const c = (
        await client.query(
          'SELECT timezone FROM congregation WHERE id=$1 FOR UPDATE',
          [congregationId],
        )
      ).rows[0];
      const r = (
        await client.query(
          'SELECT * FROM reservation WHERE id=$1 AND congregation_id=$2',
          [reservationId, congregationId],
        )
      ).rows[0];
      if (!r) throw new NotFoundException('Reserva não encontrada.');
      const payload = { scope: body.scope ?? null };
      const previous = (
        await client.query(
          'SELECT * FROM reservation_command WHERE congregation_id=$1 AND actor_account_id=$2 AND request_key=$3',
          [congregationId, accountId, body.requestKey],
        )
      ).rows[0];
      if (previous) {
        if (
          previous.reservation_id !== reservationId ||
          previous.action !== action ||
          previous.payload.scope !== payload.scope
        )
          throw unavailable('chave já usada para outra ação.');
        await client.query('COMMIT');
        return previous.result;
      }
      const now = this.now();
      let result: unknown;
      const administrators = await alertRecipients(client, congregationId);
      if (action === 'leave') {
        if (r.responsible_account_id === accountId)
          throw unavailable(
            'o responsável deve cancelar a reserva; somente o administrador pode trocá-lo.',
          );
        if (r.cancelled_at || new Date(r.ends_at) <= now)
          throw unavailable('reserva cancelada ou encerrada.');
        await assertPublishedMonths(
          client,
          congregationId,
          c.timezone,
          new Date(r.starts_at),
          new Date(r.ends_at),
          now,
        );
        const p = (
          await client.query(
            'DELETE FROM reservation_participation WHERE reservation_id=$1 AND account_id=$2 RETURNING *',
            [reservationId, accountId],
          )
        ).rows[0];
        if (!p) throw unavailable('você não participa desta reserva.');
        await client.query(
          'UPDATE reservation_attendance SET ends_at=greatest(starts_at,least(ends_at,$3)) WHERE reservation_id=$1 AND account_id=$2 AND ends_at>$3',
          [reservationId, accountId, now],
        );
        await recordReservationEvent(
          client,
          reservationId,
          accountId,
          'participant-left',
          { accountId, position: p.position, startsAt: p.starts_at },
          { leftAt: now },
        );
        await notice(
          client,
          congregationId,
          [accountId, r.responsible_account_id, ...administrators],
          `leave:${congregationId}:${accountId}:${body.requestKey}`,
          'Um participante desistiu da designação. A posição foi liberada; o tempo já decorrido foi preservado.',
          now,
        );
        result = { reservationId, left: true, leftAt: now.toISOString() };
      } else {
        if (
          r.responsible_account_id !== accountId &&
          member.role !== 'LOCAL_ADMIN'
        )
          throw new ForbiddenException(
            'Somente o responsável ou administrador pode cancelar.',
          );
        let affected = [r],
          seriesId: string | undefined;
        if (body.scope === 'following') {
          const series = (
            await client.query(
              'SELECT s.id,s.configuration FROM recurrence_occurrence o JOIN reservation_series s ON s.id=o.series_id WHERE o.reservation_id=$1',
              [reservationId],
            )
          ).rows[0];
          if (!series)
            throw unavailable('esta reserva não pertence a uma série.');
          if (
            series.configuration.responsible_account_id !== accountId &&
            member.role !== 'LOCAL_ADMIN'
          )
            throw new ForbiddenException(
              'Somente o responsável da série ou administrador pode cancelar as próximas.',
            );
          seriesId = series.id;
          affected = (
            await client.query(
              'SELECT r.* FROM recurrence_occurrence o JOIN reservation r ON r.id=o.reservation_id WHERE o.series_id=$1 AND r.congregation_id=$2 AND r.starts_at>=$3 ORDER BY r.starts_at,r.id',
              [seriesId, congregationId, r.starts_at],
            )
          ).rows;
        }
        // Validate the complete batch before changing even the first occurrence.
        for (const target of affected) {
          if (target.cancelled_at) continue;
          if (
            target.responsible_account_id !== accountId &&
            member.role !== 'LOCAL_ADMIN'
          )
            throw new ForbiddenException(
              'Uma das próximas reservas tem outro responsável. Nenhuma foi cancelada.',
            );
          if (new Date(target.ends_at) <= now)
            throw unavailable('reserva já encerrada.');
          await assertPublishedMonths(
            client,
            congregationId,
            c.timezone,
            new Date(target.starts_at),
            new Date(target.ends_at),
            now,
            member.role === 'LOCAL_ADMIN',
          );
        }
        const cancelledIds: string[] = [];
        for (const target of affected) {
          if (target.cancelled_at) continue;
          const participants = (
            await client.query(
              'SELECT account_id,position FROM reservation_participation WHERE reservation_id=$1',
              [target.id],
            )
          ).rows;
          const invites = (
            await client.query(
              "UPDATE reservation_invitation SET state='cancelled',completed_at=$2 WHERE reservation_id=$1 AND state='pending' RETURNING id,recipient_account_id",
              [target.id, now],
            )
          ).rows;
          await client.query(
            'UPDATE reservation SET cancelled_at=$2 WHERE id=$1',
            [target.id, now],
          );
          await client.query(
            'UPDATE reservation_attendance SET ends_at=greatest(starts_at,least(ends_at,$2)) WHERE reservation_id=$1',
            [target.id, now],
          );
          await client.query(
            'DELETE FROM reservation_participation WHERE reservation_id=$1',
            [target.id],
          );
          await recordReservationEvent(
            client,
            target.id,
            accountId,
            'cancelled',
            {
              responsibleAccountId: target.responsible_account_id,
              participants,
              invitationIds: invites.map((i) => i.id),
            },
            {
              cancelledAt: now,
              scope: body.scope,
              requestKey: body.requestKey,
            },
          );
          await notice(
            client,
            congregationId,
            [
              target.responsible_account_id,
              ...participants.map((p) => p.account_id),
              ...invites.map((i) => i.recipient_account_id),
              ...administrators,
            ],
            `reservation-cancelled:${target.id}`,
            'Uma designação foi cancelada. Participações e convites foram encerrados; recursos e posições foram liberados.',
            now,
          );
          cancelledIds.push(target.id);
        }
        if (seriesId)
          await client.query(
            'UPDATE reservation_series SET stopped_at=coalesce(stopped_at,$2),stopped_by_account_id=coalesce(stopped_by_account_id,$3) WHERE id=$1',
            [seriesId, now, accountId],
          );
        result = {
          reservationId,
          cancelledIds,
          stoppedSeriesId: seriesId ?? null,
        };
      }
      await client.query(
        'INSERT INTO reservation_command (congregation_id,actor_account_id,request_key,reservation_id,action,payload,result) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [
          congregationId,
          accountId,
          body.requestKey,
          reservationId,
          action,
          JSON.stringify(payload),
          JSON.stringify(result),
        ],
      );
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
