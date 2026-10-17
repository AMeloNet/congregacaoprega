import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { reservationTimes } from './reservation-time.js';
import {
  expireInvitations,
  groupPositions,
  notice,
} from './reservation-groups.js';
import {
  assertPublishedMonths,
  assertReservationResources,
  assertParticipantAgenda,
  unavailable,
} from './reservation-validation.js';

export const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type ReservationInput = {
  requestKey: string;
  pointId: string;
  date: string;
  startHour: number;
  duration: number;
  equipmentType: string;
  thirdPositionOpen: boolean;
};

export function validateReservation(input: unknown): ReservationInput {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new BadRequestException('Reserva inválida.');
  const body = input as ReservationInput;
  if (
    Object.keys(body).some(
      (key) =>
        ![
          'requestKey',
          'pointId',
          'date',
          'startHour',
          'duration',
          'equipmentType',
          'thirdPositionOpen',
        ].includes(key),
    ) ||
    !uuidPattern.test(body.requestKey ?? '') ||
    !uuidPattern.test(body.pointId ?? '') ||
    typeof body.date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(body.date) ||
    !Number.isFinite(Date.parse(`${body.date}T00:00:00Z`)) ||
    new Date(`${body.date}T00:00:00Z`).toISOString().slice(0, 10) !==
      body.date ||
    !Number.isInteger(body.startHour) ||
    body.startHour < 0 ||
    body.startHour > 23 ||
    ![1, 2].includes(body.duration) ||
    !['CART', 'KIOSK', 'DISPLAY'].includes(body.equipmentType) ||
    typeof body.thirdPositionOpen !== 'boolean'
  )
    throw new BadRequestException(
      'Informe data válida, início em hora cheia, duração de uma ou duas horas, equipamento e escolha da terceira vaga.',
    );
  return body;
}

export async function reservationAccess(
  client: PoolClient,
  accountId: string,
  congregationId: string,
) {
  if (!uuidPattern.test(congregationId))
    throw new BadRequestException('Congregação inválida.');
  const member = (
    await client.query(
      "SELECT m.role FROM membership m JOIN identity_account a ON a.id=m.account_id WHERE m.account_id=$1 AND m.congregation_id=$2 AND m.status='ACTIVE' AND a.email_verified=true FOR SHARE OF m,a",
      [accountId, congregationId],
    )
  ).rows[0];
  if (!member) throw new ForbiddenException('Acesso negado.');
  return member;
}

export async function lockReservationOwner(client: PoolClient, owner: string) {
  // Also serialize this person's reservations across congregations.
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
    `reservation:${owner}`,
  ]);
}

export type ReservationRecord = {
  id: string;
  starts_at: Date | string;
  ends_at: Date | string;
  cancelled_at: Date | null;
  responsible_account_id: string;
  third_position_open: boolean;
  local_date: string;
  start_hour: number;
  duration: number;
  point_id: string;
  equipment_type: string;
};
export async function confirmParticipant(
  client: PoolClient,
  accountId: string,
  congregationId: string,
  reservation: ReservationRecord,
  timezone: string,
  now: Date,
  invitation?: { id: string; position: number },
  administrative = false,
) {
  const start = new Date(reservation.starts_at),
    end = new Date(reservation.ends_at),
    reservationId = reservation.id;
  if (reservation.cancelled_at || end <= now)
    throw unavailable('reserva cancelada ou encerrada.');
  await assertPublishedMonths(
    client,
    congregationId,
    timezone,
    start,
    end,
    now,
    administrative,
  );
  await expireInvitations(client, reservationId, now);
  const participants = (
    await client.query(
      'SELECT account_id,position,starts_at FROM reservation_participation WHERE reservation_id=$1',
      [reservationId],
    )
  ).rows;
  const existing = participants.find((p) => p.account_id === accountId);
  if (reservation.responsible_account_id === accountId || existing)
    return {
      reservationId,
      position: existing?.position ?? 1,
      startsAt: existing?.starts_at ?? start,
      confirmedCount: participants.length + 1,
    };
  const positions = await groupPositions(client, reservationId, now);
  if (
    !invitation &&
    positions.some((p) => p.kind === 'pending' && p.account_id === accountId)
  )
    throw unavailable(
      'há um convite destinado a você; aceite ou recuse o convite.',
    );
  const position =
    invitation?.position ??
    [2, ...(reservation.third_position_open ? [3] : [])].find(
      (p) => !positions.some((o) => o.position === p),
    );
  if (
    !position ||
    positions.some(
      (p) =>
        p.position === position &&
        (!invitation || p.kind === 'confirmed' || p.account_id !== accountId),
    )
  )
    throw unavailable('não há posição aberta disponível.');
  const effectiveStart = start > now ? start : now;
  const times = reservationTimes(
    reservation.local_date,
    reservation.start_hour,
    reservation.duration,
    timezone,
  );
  await assertReservationResources(
    client,
    congregationId,
    reservation.point_id,
    reservation.equipment_type,
    { ...times, start: effectiveStart },
    reservationId,
  );
  await assertParticipantAgenda(
    client,
    accountId,
    effectiveStart,
    end,
    timezone,
  );
  await client.query(
    'INSERT INTO reservation_participation (reservation_id,account_id,position,joined_at,starts_at) VALUES ($1,$2,$3,$4,$5)',
    [reservationId, accountId, position, now, effectiveStart],
  );
  await notice(
    client,
    congregationId,
    [reservation.responsible_account_id, accountId],
    `participation:${reservationId}:${accountId}`,
    'Participação confirmada na designação.',
    now,
  );
  return {
    reservationId,
    position,
    startsAt: effectiveStart,
    confirmedCount: participants.length + 2,
  };
}

export async function createReservation(
  client: PoolClient,
  owner: string,
  congregationId: string,
  role: string,
  timezone: string,
  input: ReservationInput,
  now: Date,
) {
  const previous = (
    await client.query(
      'SELECT * FROM reservation WHERE congregation_id=$1 AND responsible_account_id=$2 AND request_key=$3',
      [congregationId, owner, input.requestKey],
    )
  ).rows[0];
  if (previous) {
    if (
      previous.point_id !== input.pointId ||
      previous.local_date !== input.date ||
      previous.start_hour !== input.startHour ||
      previous.duration !== input.duration ||
      previous.equipment_type !== input.equipmentType ||
      previous.third_position_open !== input.thirdPositionOpen
    )
      throw new ConflictException(
        'Identificador de requisição já usado para outra reserva.',
      );
    return previous;
  }
  const times = reservationTimes(
    input.date,
    input.startHour,
    input.duration,
    timezone,
  );
  if (times.start <= now)
    throw new BadRequestException('Escolha um horário futuro.');
  await assertPublishedMonths(
    client,
    congregationId,
    timezone,
    times.start,
    times.end,
    now,
    role === 'LOCAL_ADMIN',
  );
  await assertReservationResources(
    client,
    congregationId,
    input.pointId,
    input.equipmentType,
    times,
  );
  await assertParticipantAgenda(
    client,
    owner,
    times.start,
    times.end,
    timezone,
  );
  return (
    await client.query(
      'INSERT INTO reservation (id,congregation_id,point_id,responsible_account_id,request_key,local_date,start_hour,duration,equipment_type,third_position_open,starts_at,ends_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *',
      [
        randomUUID(),
        congregationId,
        input.pointId,
        owner,
        input.requestKey,
        input.date,
        input.startHour,
        input.duration,
        input.equipmentType,
        input.thirdPositionOpen,
        times.start,
        times.end,
      ],
    )
  ).rows[0];
}

export class ReservationsService {
  constructor(
    private readonly pool: Pool,
    private readonly now = () => new Date(),
  ) {}
  async thirdPosition(
    accountId: string,
    congregationId: string,
    reservationId: string,
    input: unknown,
  ) {
    if (
      !uuidPattern.test(reservationId) ||
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      Object.keys(input).length !== 1 ||
      typeof (input as { open?: unknown }).open !== 'boolean'
    )
      throw new BadRequestException(
        'Informe somente a escolha de abertura da terceira vaga.',
      );
    const open = (input as { open: boolean }).open;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const member = await reservationAccess(client, accountId, congregationId);
      const congregation = (
        await client.query(
          'SELECT timezone FROM congregation WHERE id=$1 FOR UPDATE',
          [congregationId],
        )
      ).rows[0];
      const reservation = (
        await client.query(
          'SELECT * FROM reservation WHERE id=$1 AND congregation_id=$2',
          [reservationId, congregationId],
        )
      ).rows[0];
      if (!reservation) throw new NotFoundException('Reserva não encontrada.');
      if (
        reservation.responsible_account_id !== accountId &&
        member.role !== 'LOCAL_ADMIN'
      )
        throw new ForbiddenException(
          'Somente o responsável ou administrador pode alterar a terceira vaga.',
        );
      const now = this.now();
      if (reservation.cancelled_at || new Date(reservation.ends_at) <= now)
        throw unavailable('reserva cancelada ou encerrada.');
      await assertPublishedMonths(
        client,
        congregationId,
        congregation.timezone,
        new Date(reservation.starts_at),
        new Date(reservation.ends_at),
        now,
        member.role === 'LOCAL_ADMIN',
      );
      await expireInvitations(client, reservationId, now);
      if (reservation.third_position_open !== open) {
        const occupied = await client.query(
          `SELECT 1 FROM reservation_participation WHERE reservation_id=$1 AND position=3 UNION ALL SELECT 1 FROM reservation_invitation WHERE reservation_id=$1 AND position=3 AND state='pending' AND expires_at>$2`,
          [reservationId, now],
        );
        if (occupied.rowCount)
          throw unavailable(
            'a terceira vaga já contém participante ou convite pendente.',
          );
        await client.query(
          'UPDATE reservation SET third_position_open=$2 WHERE id=$1',
          [reservationId, open],
        );
        await client.query(
          'INSERT INTO reservation_history (id,reservation_id,actor_account_id,action,previous,configuration) VALUES ($1,$2,$3,$4,$5,$6)',
          [
            randomUUID(),
            reservationId,
            accountId,
            'third-position',
            JSON.stringify({ open: reservation.third_position_open }),
            JSON.stringify({ open }),
          ],
        );
      }
      await client.query('COMMIT');
      return { reservationId, thirdPositionOpen: open };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async join(
    accountId: string,
    congregationId: string,
    reservationId: string,
    input?: unknown,
  ) {
    if (
      !uuidPattern.test(reservationId) ||
      (input !== undefined &&
        (!input ||
          typeof input !== 'object' ||
          Array.isArray(input) ||
          Object.keys(input).length > 0))
    )
      throw new BadRequestException(
        'O ingresso não aceita participante ou posição informados pelo cliente.',
      );
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await reservationAccess(client, accountId, congregationId);
      await lockReservationOwner(client, accountId);
      const congregation = (
        await client.query(
          'SELECT timezone FROM congregation WHERE id=$1 FOR UPDATE',
          [congregationId],
        )
      ).rows[0];
      const reservation = (
        await client.query(
          'SELECT * FROM reservation WHERE id=$1 AND congregation_id=$2',
          [reservationId, congregationId],
        )
      ).rows[0];
      if (!reservation) throw new NotFoundException('Reserva não encontrada.');
      const result = await confirmParticipant(
        client,
        accountId,
        congregationId,
        reservation,
        congregation.timezone,
        this.now(),
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
  async create(accountId: string, congregationId: string, input: unknown) {
    const body = validateReservation(input);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const member = await reservationAccess(client, accountId, congregationId);
      await lockReservationOwner(client, accountId);
      const congregation = (
        await client.query(
          'SELECT timezone FROM congregation WHERE id=$1 FOR UPDATE',
          [congregationId],
        )
      ).rows[0];
      const result = await createReservation(
        client,
        accountId,
        congregationId,
        member.role,
        congregation.timezone,
        body,
        this.now(),
      );
      await client.query('COMMIT');
      return {
        id: result.id,
        date: result.local_date,
        startHour: result.start_hour,
        duration: result.duration,
        crossesMidnight: result.start_hour + result.duration >= 24,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
