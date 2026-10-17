import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { Pool, QueryResultRow } from 'pg';
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
  alertRecipients,
  expireInvitations,
  groupPositions,
  notice,
  recordReservationEvent,
} from './reservation-groups.js';

export function reservationRevision(
  r: QueryResultRow,
  positions: QueryResultRow[],
) {
  const keys = [
    'id',
    'responsible_account_id',
    'point_id',
    'local_date',
    'start_hour',
    'duration',
    'equipment_type',
    'third_position_open',
    'cancelled_at',
  ];
  return createHash('sha256')
    .update(
      JSON.stringify([
        keys.map((key) => r[key]),
        [...positions].sort(
          (a, b) =>
            a.position - b.position ||
            a.kind.localeCompare(b.kind) ||
            a.account_id.localeCompare(b.account_id),
        ),
      ]),
    )
    .digest('hex');
}

export class ReservationAdministrationService {
  constructor(
    private readonly pool: Pool,
    private readonly now = () => new Date(),
  ) {}
  async detail(
    accountId: string,
    congregationId: string,
    reservationId: string,
  ) {
    if (!uuidPattern.test(reservationId))
      throw new BadRequestException('Reserva inválida.');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const member = await reservationAccess(client, accountId, congregationId);
      const c = (
        await client.query(
          'SELECT timezone FROM congregation WHERE id=$1 FOR UPDATE',
          [congregationId],
        )
      ).rows[0];
      const r = (
        await client.query(
          'SELECT r.*,p.name AS point_name FROM reservation r JOIN preaching_point p ON p.id=r.point_id WHERE r.id=$1 AND r.congregation_id=$2',
          [reservationId, congregationId],
        )
      ).rows[0];
      if (!r) throw new NotFoundException('Reserva não encontrada.');
      const positions = await groupPositions(client, reservationId, this.now());
      const participants = (
        await client.query(
          `SELECT roster.account_id AS "accountId",roster.position,p.display_name AS name FROM (SELECT responsible_account_id AS account_id,1 AS position FROM reservation WHERE id=$1 UNION ALL SELECT account_id,position FROM reservation_participation WHERE reservation_id=$1) roster LEFT JOIN publisher_profile p ON p.account_id=roster.account_id AND p.congregation_id=$2 ORDER BY roster.position`,
          [reservationId, congregationId],
        )
      ).rows;
      const history =
        r.responsible_account_id === accountId || member.role === 'LOCAL_ADMIN'
          ? (
              await client.query(
                'SELECT action,previous,configuration,created_at AS "createdAt" FROM reservation_history WHERE reservation_id=$1 ORDER BY created_at,id',
                [reservationId],
              )
            ).rows
          : [];
      await client.query('COMMIT');
      return {
        id: r.id,
        pointId: r.point_id,
        pointName: r.point_name,
        date: r.local_date,
        startHour: r.start_hour,
        duration: r.duration,
        equipmentType: r.equipment_type,
        thirdPositionOpen: r.third_position_open,
        cancelledAt: r.cancelled_at,
        participants,
        revision: reservationRevision(r, positions),
        timezone: c.timezone,
        history,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async execute(
    accountId: string,
    congregationId: string,
    reservationId: string,
    input: unknown,
  ) {
    const body = input as {
      requestKey: string;
      revision: string;
      action: 'include' | 'remove' | 'responsible';
      accountId?: string;
    };
    if (
      !uuidPattern.test(reservationId) ||
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      !uuidPattern.test(body.requestKey ?? '') ||
      typeof body.revision !== 'string' ||
      !/^[a-f0-9]{64}$/.test(body.revision) ||
      !['include', 'remove', 'responsible'].includes(body.action) ||
      Object.keys(body).some(
        (key) =>
          !['requestKey', 'revision', 'action', 'accountId'].includes(key),
      ) ||
      !uuidPattern.test(body.accountId ?? '')
    )
      throw new BadRequestException(
        'Ajuste administrativo inválido. Recarregue os dados e escolha a ação.',
      );
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const member = await reservationAccess(client, accountId, congregationId);
      if (member.role !== 'LOCAL_ADMIN')
        throw new ForbiddenException('Ajuste restrito ao administrador local.');
      const preliminary = (
        await client.query(
          'SELECT * FROM reservation WHERE id=$1 AND congregation_id=$2',
          [reservationId, congregationId],
        )
      ).rows[0];
      if (!preliminary) throw new NotFoundException('Reserva não encontrada.');
      const before = await groupPositions(client, reservationId, this.now());
      const accounts = [
        ...new Set([
          preliminary.responsible_account_id,
          ...before
            .filter((p) => p.kind === 'confirmed')
            .map((p) => p.account_id),
          ...(body.accountId ? [body.accountId] : []),
        ]),
      ].sort() as string[];
      for (const id of accounts) {
        if (id === body.accountId && body.action !== 'remove')
          await reservationAccess(client, id, congregationId);
        await lockReservationOwner(client, id);
      }
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
      const payload = { ...body };
      delete (payload as Partial<typeof body>).requestKey;
      const previous = (
        await client.query(
          'SELECT * FROM reservation_command WHERE congregation_id=$1 AND actor_account_id=$2 AND request_key=$3',
          [congregationId, accountId, body.requestKey],
        )
      ).rows[0];
      if (previous) {
        if (
          previous.reservation_id !== reservationId ||
          previous.action !== 'administration' ||
          !isDeepStrictEqual(previous.payload, payload)
        )
          throw unavailable('chave já usada para outra ação.');
        await client.query('COMMIT');
        return previous.result;
      }
      const now = this.now();
      const positions = await groupPositions(client, reservationId, now);
      if (
        body.revision !== reservationRevision(r, positions) ||
        r.responsible_account_id !== preliminary.responsible_account_id ||
        positions.some(
          (p) => p.kind === 'confirmed' && !accounts.includes(p.account_id),
        )
      )
        throw unavailable('a reserva mudou. Recarregue antes de ajustar.');
      if (r.cancelled_at || new Date(r.ends_at) <= now)
        throw unavailable('reserva cancelada ou encerrada.');
      await assertPublishedMonths(
        client,
        congregationId,
        c.timezone,
        new Date(r.starts_at),
        new Date(r.ends_at),
        now,
        true,
      );
      await expireInvitations(client, reservationId, now);
      const confirmed = positions.filter((p) => p.kind === 'confirmed');
      let result: unknown;
      if (body.action === 'include') {
        const target = body.accountId!;
        if (
          target === r.responsible_account_id ||
          confirmed.some((p) => p.account_id === target)
        )
          throw unavailable('publicador já confirmado.');
        const pending = (
          await client.query(
            "SELECT * FROM reservation_invitation WHERE reservation_id=$1 AND recipient_account_id=$2 AND state='pending' AND expires_at>$3",
            [reservationId, target, now],
          )
        ).rows[0];
        const position =
          pending?.position ??
          [2, 3].find((p) => !positions.some((o) => o.position === p));
        if (!position) throw unavailable('grupo cheio.');
        if (pending)
          await client.query(
            "UPDATE reservation_invitation SET state='revoked',completed_at=$2 WHERE id=$1",
            [pending.id, now],
          );
        // Directed administrative inclusion is separate from the invitee's acceptance.
        result = await confirmParticipant(
          client,
          target,
          congregationId,
          r,
          c.timezone,
          now,
          { id: pending?.id ?? randomUUID(), position },
          true,
        );
        await recordReservationEvent(
          client,
          reservationId,
          accountId,
          'admin-included',
          { invitationId: pending?.id ?? null },
          { accountId: target, position },
        );
      } else if (body.action === 'remove') {
        const target = body.accountId!;
        const participant = confirmed.find((p) => p.account_id === target);
        if (!participant)
          throw unavailable('selecione um participante adicional confirmado.');
        await client.query(
          'UPDATE reservation_attendance SET ends_at=greatest(starts_at,least(ends_at,$3)) WHERE reservation_id=$1 AND account_id=$2 AND ends_at>$3',
          [reservationId, target, now],
        );
        await client.query(
          'DELETE FROM reservation_participation WHERE reservation_id=$1 AND account_id=$2',
          [reservationId, target],
        );
        await recordReservationEvent(
          client,
          reservationId,
          accountId,
          'admin-removed',
          { accountId: target, position: participant.position },
          { leftAt: now },
        );
        result = { reservationId, removedAccountId: target };
      } else if (body.action === 'responsible') {
        const target = body.accountId!;
        const participant = confirmed.find((p) => p.account_id === target);
        if (!participant)
          throw unavailable(
            'o novo responsável precisa estar confirmado como participante.',
          );
        await client.query(
          'UPDATE reservation_attendance SET ends_at=greatest(starts_at,least(ends_at,$3)) WHERE reservation_id=$1 AND account_id=$2 AND ends_at>$3',
          [reservationId, r.responsible_account_id, now],
        );
        await client.query(
          'DELETE FROM reservation_participation WHERE reservation_id=$1 AND account_id=$2',
          [reservationId, target],
        );
        await client.query(
          'UPDATE reservation SET responsible_account_id=$2 WHERE id=$1',
          [reservationId, target],
        );
        await recordReservationEvent(
          client,
          reservationId,
          accountId,
          'responsible-changed',
          { accountId: r.responsible_account_id },
          { accountId: target, previousResponsibleLeft: true },
        );
        result = {
          reservationId,
          responsibleAccountId: target,
          previousResponsibleLeft: true,
        };
      }
      const recipients = [
        r.responsible_account_id,
        ...positions.map((p) => p.account_id),
        ...(body.accountId ? [body.accountId] : []),
        ...(await alertRecipients(client, congregationId)),
      ];
      await notice(
        client,
        congregationId,
        recipients,
        `admin-adjustment:${congregationId}:${accountId}:${body.requestKey}`,
        body.action === 'responsible'
          ? 'O responsável da designação foi alterado. O responsável anterior saiu do grupo; a recorrência original não foi transferida.'
          : 'Uma designação foi ajustada pelo administrador. Consulte a programação atualizada.',
        now,
        reservationId,
      );
      await client.query(
        'INSERT INTO reservation_command (congregation_id,actor_account_id,request_key,reservation_id,action,payload,result) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [
          congregationId,
          accountId,
          body.requestKey,
          reservationId,
          'administration',
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
