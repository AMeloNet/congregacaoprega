import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { isDeepStrictEqual } from 'node:util';
import type { Pool } from 'pg';
import {
  lockReservationOwner,
  reservationAccess,
  validateReservation,
  uuidPattern,
} from './reservations.service.js';
import { reservationTimes } from './reservation-time.js';
import {
  assertParticipantAgenda,
  assertPublishedMonths,
  assertReservationResources,
  unavailable,
} from './reservation-validation.js';
import {
  alertRecipients,
  expireInvitations,
  groupPositions,
  notice,
  recordReservationEvent,
} from './reservation-groups.js';
import { reservationRevision } from './reservation-administration.service.js';

export class ReservationEditService {
  constructor(
    private readonly pool: Pool,
    private readonly now = () => new Date(),
  ) {}
  async execute(
    actor: string,
    congregationId: string,
    reservationId: string,
    input: unknown,
  ) {
    if (
      !uuidPattern.test(reservationId) ||
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input)
    )
      throw new BadRequestException('Reserva inválida.');
    const { revision, ...configuration } = input as Record<string, unknown>;
    if (typeof revision !== 'string' || !/^[a-f0-9]{64}$/.test(revision))
      throw new BadRequestException('Recarregue a reserva antes de editar.');
    const body = validateReservation(configuration);
    if (body.responsibleAccountId !== undefined)
      throw new BadRequestException('Use a ação Trocar responsável.');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const member = await reservationAccess(client, actor, congregationId);
      if (member.role !== 'LOCAL_ADMIN')
        throw new ForbiddenException('Acesso restrito ao administrador local.');
      // All roster mutations serialize on the congregation; lock its roster first
      // in account order, consistent with participant operations across congregations.
      const initial = (
        await client.query(
          'SELECT responsible_account_id FROM reservation WHERE id=$1 AND congregation_id=$2',
          [reservationId, congregationId],
        )
      ).rows[0];
      if (!initial) throw new NotFoundException('Reserva não encontrada.');
      const accounts = (
        await client.query(
          'SELECT responsible_account_id AS id FROM reservation WHERE id=$1 UNION SELECT account_id AS id FROM reservation_participation WHERE reservation_id=$1 ORDER BY id',
          [reservationId],
        )
      ).rows.map((r) => r.id as string);
      for (const id of accounts) await lockReservationOwner(client, id);
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
      const previous = (
        await client.query(
          'SELECT * FROM reservation_command WHERE congregation_id=$1 AND actor_account_id=$2 AND request_key=$3',
          [congregationId, actor, body.requestKey],
        )
      ).rows[0];
      if (previous) {
        if (
          previous.reservation_id !== reservationId ||
          previous.action !== 'edit' ||
          !isDeepStrictEqual(previous.payload, input)
        )
          throw unavailable('chave já usada para outra ação.');
        await client.query('COMMIT');
        return previous.result;
      }
      const now = this.now();
      if (r.cancelled_at || new Date(r.starts_at) <= now)
        throw unavailable('somente reservas futuras podem ser remarcadas.');
      await expireInvitations(client, reservationId, now);
      const positions = await groupPositions(client, reservationId, now);
      if (reservationRevision(r, positions) !== revision)
        throw unavailable('a reserva mudou; recarregue antes de editar.');
      const roster = [
        r.responsible_account_id,
        ...positions
          .filter((p) => p.kind === 'confirmed')
          .map((p) => p.account_id),
      ];
      if (roster.some((id) => !accounts.includes(id)))
        throw unavailable('os participantes mudaram; recarregue.');
      const times = reservationTimes(
        body.date,
        body.startHour,
        body.duration,
        c.timezone,
      );
      if (times.start <= now)
        throw new BadRequestException('Escolha um horário futuro.');
      await assertPublishedMonths(
        client,
        congregationId,
        c.timezone,
        new Date(r.starts_at),
        new Date(r.ends_at),
        now,
        true,
      );
      await assertPublishedMonths(
        client,
        congregationId,
        c.timezone,
        times.start,
        times.end,
        now,
        true,
      );
      await assertReservationResources(
        client,
        congregationId,
        body.pointId,
        body.equipmentType,
        times,
        reservationId,
      );
      for (const id of roster) {
        await reservationAccess(client, id, congregationId);
        await assertParticipantAgenda(
          client,
          id,
          times.start,
          times.end,
          c.timezone,
          reservationId,
        );
      }
      if (
        r.third_position_open !== body.thirdPositionOpen &&
        positions.some((p) => p.position === 3)
      )
        throw unavailable('a terceira posição já está ocupada.');
      await client.query(
        'UPDATE reservation SET point_id=$2,local_date=$3,start_hour=$4,duration=$5,equipment_type=$6,third_position_open=$7,starts_at=$8,ends_at=$9 WHERE id=$1',
        [
          reservationId,
          body.pointId,
          body.date,
          body.startHour,
          body.duration,
          body.equipmentType,
          body.thirdPositionOpen,
          times.start,
          times.end,
        ],
      );
      await client.query(
        'UPDATE reservation_participation SET starts_at=$2 WHERE reservation_id=$1',
        [reservationId, times.start],
      );
      // Preserve ended attendance; only move the current future attendance periods.
      await client.query(
        'UPDATE reservation_attendance SET starts_at=$2,ends_at=$3 WHERE reservation_id=$1 AND ends_at>starts_at AND ends_at>$4',
        [reservationId, times.start, times.end, now],
      );
      await client.query(
        "UPDATE reservation_invitation SET expires_at=least(expires_at,$2) WHERE reservation_id=$1 AND state='pending'",
        [reservationId, times.start],
      );
      await recordReservationEvent(
        client,
        reservationId,
        actor,
        'admin-edited',
        {
          pointId: r.point_id,
          date: r.local_date,
          startHour: r.start_hour,
          duration: r.duration,
          equipmentType: r.equipment_type,
          thirdPositionOpen: r.third_position_open,
        },
        body,
      );
      await notice(
        client,
        congregationId,
        [
          ...roster,
          ...positions.map((p) => p.account_id),
          ...(await alertRecipients(client, congregationId)),
        ],
        `edit:${congregationId}:${actor}:${body.requestKey}`,
        'O administrador alterou os dados da reserva. Consulte a designação atualizada.',
        now,
        reservationId,
      );
      const result = { id: reservationId, updated: true };
      await client.query(
        'INSERT INTO reservation_command (congregation_id,actor_account_id,request_key,reservation_id,action,payload,result) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [
          congregationId,
          actor,
          body.requestKey,
          reservationId,
          'edit',
          JSON.stringify(input),
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
