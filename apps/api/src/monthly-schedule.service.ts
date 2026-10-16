import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import type { Pool } from 'pg';

export function localMonth(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  return `${parts.find((p) => p.type === 'year')!.value}-${parts.find((p) => p.type === 'month')!.value}`;
}

export function followingMonth(month: string) {
  const [year, number] = month.split('-').map(Number);
  return number === 12
    ? `${year! + 1}-01`
    : `${year}-${String(number! + 1).padStart(2, '0')}`;
}

export class MonthlyScheduleService {
  constructor(
    private readonly pool: Pool,
    private readonly now = () => new Date(),
  ) {}

  async execute(
    accountId: string,
    congregationId: string,
    action: 'get' | 'finalize' | 'reopen',
    month?: string,
  ) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        congregationId,
      ) ||
      (month !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    )
      throw new BadRequestException('Identificador ou mês inválido.');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const membership = (
        await client.query(
          "SELECT m.role FROM membership m JOIN identity_account a ON a.id=m.account_id WHERE m.account_id=$1 AND m.congregation_id=$2 AND m.status='ACTIVE' AND a.email_verified=true FOR SHARE OF m,a",
          [accountId, congregationId],
        )
      ).rows[0];
      if (
        !membership ||
        (action !== 'get' && membership.role !== 'LOCAL_ADMIN')
      )
        throw new ForbiddenException('Acesso negado.');
      const congregation = (
        await client.query(
          'SELECT timezone FROM congregation WHERE id=$1 FOR UPDATE',
          [congregationId],
        )
      ).rows[0];
      const current = localMonth(this.now(), congregation.timezone);
      const months = [current, followingMonth(current)];
      if (action !== 'get') {
        if (!month || !months.includes(month))
          throw new BadRequestException('Escolha o mês atual ou seguinte.');
        const existing = (
          await client.query(
            'SELECT state FROM schedule_month WHERE congregation_id=$1 AND month=$2',
            [congregationId, month],
          )
        ).rows[0];
        const state = existing?.state ?? 'open';
        if (
          (action === 'reopen' && state !== 'finalized') ||
          (action === 'finalize' && state === 'finalized')
        )
          throw new ConflictException(
            'O estado do mês mudou. Recarregue a programação.',
          );
        const next = action === 'finalize' ? 'finalized' : 'reopened';
        await client.query(
          'INSERT INTO schedule_month (congregation_id,month,state) VALUES ($1,$2,$3) ON CONFLICT (congregation_id,month) DO UPDATE SET state=EXCLUDED.state',
          [congregationId, month, next],
        );
        await client.query(
          'INSERT INTO schedule_month_history (id,congregation_id,month,actor_account_id,previous_state,state) VALUES ($1,$2,$3,$4,$5,$6)',
          [randomUUID(), congregationId, month, accountId, state, next],
        );
      }
      const states = (
        await client.query(
          'SELECT month,state FROM schedule_month WHERE congregation_id=$1 AND month=ANY($2)',
          [congregationId, months],
        )
      ).rows;
      const points = (
        await client.query(
          'SELECT id,name,capacity,allowed_types::text[] AS "allowedTypes" FROM preaching_point WHERE congregation_id=$1 ORDER BY lower(name),id',
          [congregationId],
        )
      ).rows;
      const hours = (
        await client.query(
          'SELECT h.point_id,h.day,h.mode,h.intervals FROM point_weekly_hours_day h JOIN preaching_point p ON p.id=h.point_id WHERE p.congregation_id=$1',
          [congregationId],
        )
      ).rows;
      const equipment = (
        await client.query(
          'SELECT type,count(*)::int AS units FROM equipment WHERE congregation_id=$1 AND active GROUP BY type',
          [congregationId],
        )
      ).rows;
      const reservations = (
        await client.query(
          `SELECT r.id,r.point_id AS "pointId",p.name AS "pointName",r.local_date AS date,r.start_hour AS "startHour",r.duration,r.equipment_type AS "equipmentType",r.third_position_open AS "thirdPositionOpen",(r.responsible_account_id=$3) AS "isResponsible" FROM reservation r JOIN preaching_point p ON p.id=r.point_id WHERE r.congregation_id=$1 AND substring(r.local_date,1,7)=ANY($2) AND r.cancelled_at IS NULL ORDER BY r.local_date,r.start_hour,r.id`,
          [congregationId, months, accountId],
        )
      ).rows;
      await client.query('COMMIT');
      return {
        timezone: congregation.timezone,
        months: months.map((value) => {
          const state = states.find((s) => s.month === value)?.state ?? 'open';
          return { month: value, state, canBook: state === 'open' };
        }),
        points: points.map((point) => ({
          ...point,
          days: Array.from({ length: 7 }, (_, day) => {
            const stored = hours.find(
              (h) => h.point_id === point.id && h.day === day,
            );
            return {
              day,
              mode: stored?.mode ?? 'unrestricted',
              intervals: stored?.intervals ?? [],
            };
          }),
        })),
        equipment,
        reservations,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
