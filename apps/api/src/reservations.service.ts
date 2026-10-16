import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { followingMonth, localMonth } from './monthly-schedule.service.js';
import { localParts, reservationTimes } from './reservation-time.js';

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
export const unavailable = (reason: string) =>
  new ConflictException({
    code: 'RESERVATION_UNAVAILABLE',
    message: `Reserva indisponível: ${reason}`,
  });

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
  const current = localMonth(now, timezone);
  const allowed = [current, followingMonth(current)];
  const touched = [
    ...new Set([input.date.slice(0, 7), localMonth(times.end, timezone)]),
  ];
  if (touched.some((month) => !allowed.includes(month)))
    throw unavailable('mês fora do período liberado.');
  const states = (
    await client.query(
      'SELECT state FROM schedule_month WHERE congregation_id=$1 AND month=ANY($2)',
      [congregationId, touched],
    )
  ).rows;
  if (
    states.some(
      (row) =>
        row.state === 'finalized' ||
        (row.state === 'reopened' && role !== 'LOCAL_ADMIN'),
    )
  )
    throw unavailable('mês bloqueado.');
  const point = (
    await client.query(
      'SELECT capacity,allowed_types::text[] AS types FROM preaching_point WHERE id=$1 AND congregation_id=$2',
      [input.pointId, congregationId],
    )
  ).rows[0];
  if (!point) throw new NotFoundException('Ponto não encontrado.');
  if (!point.types.includes(input.equipmentType))
    throw unavailable('tipo de equipamento não permitido no ponto.');
  const hours = (
    await client.query(
      'SELECT day,mode,intervals FROM point_weekly_hours_day WHERE point_id=$1',
      [input.pointId],
    )
  ).rows;
  for (const segment of times.segments) {
    const day = hours.find((row) => row.day === segment.weekday);
    const minute = segment.hour * 60;
    const minutes = (text: string) => {
      const [hour, part] = text.split(':').map(Number);
      return hour! * 60 + part!;
    };
    let coveredUntil = minute;
    if (day?.mode === 'intervals') {
      const ranges = (day.intervals as { start: string; end: string }[])
        .map(
          (interval) =>
            [minutes(interval.start), minutes(interval.end)] as const,
        )
        .sort((a, b) => a[0] - b[0]);
      for (const [start, end] of ranges) {
        if (start > coveredUntil) break;
        if (end > coveredUntil) coveredUntil = end;
      }
    }
    if (
      day?.mode === 'closed' ||
      (day?.mode === 'intervals' && coveredUntil < minute + 60)
    )
      throw unavailable('horário fechado no ponto.');
  }
  const reservations = (
    await client.query(
      'SELECT point_id,equipment_type,starts_at,ends_at FROM reservation WHERE congregation_id=$1 AND cancelled_at IS NULL AND starts_at<$3 AND ends_at>$2',
      [congregationId, times.start, times.end],
    )
  ).rows;
  const units = Number(
    (
      await client.query(
        'SELECT count(*) FROM equipment WHERE congregation_id=$1 AND type=$2 AND active',
        [congregationId, input.equipmentType],
      )
    ).rows[0].count,
  );
  // Check the peak simultaneous use, not the total number of intersecting rows.
  const boundaries = [
    times.start.getTime(),
    ...reservations.map((row) =>
      Math.max(times.start.getTime(), new Date(row.starts_at).getTime()),
    ),
  ];
  for (const instant of boundaries) {
    const active = reservations.filter(
      (row) =>
        new Date(row.starts_at).getTime() <= instant &&
        new Date(row.ends_at).getTime() > instant,
    );
    if (
      active.filter((row) => row.point_id === input.pointId).length >=
        point.capacity ||
      active.filter((row) => row.equipment_type === input.equipmentType)
        .length >= units
    )
      throw unavailable('ponto ou equipamento ocupado.');
  }
  const own = (
    await client.query(
      'SELECT starts_at,ends_at FROM reservation WHERE responsible_account_id=$1 AND cancelled_at IS NULL AND starts_at<$3 AND ends_at>$2',
      [
        owner,
        new Date(times.start.getTime() - 48 * 3600000),
        new Date(times.end.getTime() + 48 * 3600000),
      ],
    )
  ).rows;
  if (
    own.some(
      (row) =>
        new Date(row.starts_at) < times.end &&
        new Date(row.ends_at) > times.start,
    )
  )
    throw unavailable('participante já designado neste horário.');
  const totals = new Map<string, number>();
  for (const row of own) {
    for (
      let instant = new Date(row.starts_at).getTime();
      instant < new Date(row.ends_at).getTime();
      instant += 60000
    ) {
      const date = localParts(new Date(instant), timezone).date;
      totals.set(
        date,
        (totals.get(date) ?? 0) +
          Math.min(60000, new Date(row.ends_at).getTime() - instant) / 60000,
      );
    }
  }
  for (const segment of times.segments) {
    totals.set(segment.date, (totals.get(segment.date) ?? 0) + 60);
    if (totals.get(segment.date)! > 480)
      throw unavailable('limite de oito horas por dia excedido.');
  }
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
