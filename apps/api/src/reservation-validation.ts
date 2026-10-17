import { ConflictException, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { followingMonth, localMonth } from './monthly-schedule.service.js';
import { localParts } from './reservation-time.js';

export const unavailable = (reason: string) =>
  new ConflictException({
    code: 'RESERVATION_UNAVAILABLE',
    message: `Reserva indisponível: ${reason}`,
  });

export async function assertPublishedMonths(
  client: PoolClient,
  congregationId: string,
  timezone: string,
  start: Date,
  end: Date,
  now: Date,
  administrative = false,
) {
  const current = localMonth(now, timezone),
    allowed = [current, followingMonth(current)];
  const touched = [
    ...new Set([localMonth(start, timezone), localMonth(end, timezone)]),
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
        (row.state === 'reopened' && !administrative),
    )
  )
    throw unavailable('mês bloqueado.');
}

export async function assertParticipantAgenda(
  client: PoolClient,
  accountId: string,
  start: Date,
  end: Date,
  timezone: string,
) {
  const own = (
    await client.query(
      `SELECT a.starts_at,least(a.ends_at,coalesce(r.cancelled_at,a.ends_at)) AS ends_at FROM reservation_attendance a JOIN reservation r ON r.id=a.reservation_id WHERE a.account_id=$1 AND a.starts_at<$3 AND a.ends_at>$2 AND least(a.ends_at,coalesce(r.cancelled_at,a.ends_at))>a.starts_at`,
      [
        accountId,
        new Date(start.getTime() - 48 * 3600000),
        new Date(end.getTime() + 48 * 3600000),
      ],
    )
  ).rows;
  if (
    own.some(
      (row) => new Date(row.starts_at) < end && new Date(row.ends_at) > start,
    )
  )
    throw unavailable('participante já designado neste horário.');
  const totals = new Map<string, number>();
  const add = (from: Date, to: Date, check: boolean) => {
    for (let instant = from.getTime(); instant < to.getTime();) {
      const next = Math.min(
        to.getTime(),
        (Math.floor(instant / 60000) + 1) * 60000,
      );
      const date = localParts(new Date(instant), timezone).date;
      const total = (totals.get(date) ?? 0) + next - instant;
      totals.set(date, total);
      if (check && total > 8 * 3600000)
        throw unavailable('limite de oito horas por dia excedido.');
      instant = next;
    }
  };
  own.forEach((row) =>
    add(new Date(row.starts_at), new Date(row.ends_at), false),
  );
  add(start, end, true);
}

export async function assertReservationResources(
  client: PoolClient,
  congregationId: string,
  pointId: string,
  equipmentType: string,
  times: ReturnType<typeof import('./reservation-time.js').reservationTimes>,
  excludeReservationId: string | null = null,
) {
  const point = (
    await client.query(
      'SELECT capacity,allowed_types::text[] AS types FROM preaching_point WHERE id=$1 AND congregation_id=$2',
      [pointId, congregationId],
    )
  ).rows[0];
  if (!point) throw new NotFoundException('Ponto não encontrado.');
  if (!point.types.includes(equipmentType))
    throw unavailable('tipo de equipamento não permitido no ponto.');
  const hours = (
    await client.query(
      'SELECT day,mode,intervals FROM point_weekly_hours_day WHERE point_id=$1',
      [pointId],
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
      'SELECT point_id,equipment_type,starts_at,ends_at FROM reservation WHERE congregation_id=$1 AND cancelled_at IS NULL AND starts_at<$3 AND ends_at>$2 AND ($4::uuid IS NULL OR id<>$4)',
      [congregationId, times.start, times.end, excludeReservationId],
    )
  ).rows;
  const units = Number(
    (
      await client.query(
        'SELECT count(*) FROM equipment WHERE congregation_id=$1 AND type=$2 AND active',
        [congregationId, equipmentType],
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
      active.filter((row) => row.point_id === pointId).length >=
        point.capacity ||
      active.filter((row) => row.equipment_type === equipmentType).length >=
        units
    )
      throw unavailable('ponto ou equipamento ocupado.');
  }
}
