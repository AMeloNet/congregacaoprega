import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import type { Pool } from 'pg';

type Day = {
  day: number;
  mode: 'unrestricted' | 'closed' | 'intervals';
  intervals: { start: string; end: string }[];
};
const invalid = () =>
  new BadRequestException(
    'Configuração inválida. Use sete dias e intervalos sem sobreposição, dentro do mesmo dia.',
  );
function validate(input: unknown): {
  timezone: string;
  version: number;
  days: Day[];
} {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw invalid();
  const body = input as Record<string, unknown>;
  if (
    Object.keys(body).some(
      (key) => !['timezone', 'version', 'days'].includes(key),
    ) ||
    typeof body.timezone !== 'string' ||
    body.timezone.length > 100 ||
    !Number.isSafeInteger(body.version) ||
    (body.version as number) < 0 ||
    !Array.isArray(body.days) ||
    body.days.length !== 7
  )
    throw invalid();
  try {
    // Require an IANA name, rather than a fixed UTC offset.
    if (!body.timezone.includes('/') && body.timezone !== 'UTC')
      throw invalid();
    new Intl.DateTimeFormat('pt-BR', { timeZone: body.timezone }).format();
  } catch {
    throw new BadRequestException('Informe um fuso IANA válido.');
  }
  const seen = new Set<number>();
  const days = body.days
    .map((value: unknown) => {
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw invalid();
      const day = value as Day;
      if (
        Object.keys(day).some(
          (key) => !['day', 'mode', 'intervals'].includes(key),
        ) ||
        !Number.isInteger(day.day) ||
        day.day < 0 ||
        day.day > 6 ||
        seen.has(day.day) ||
        !['unrestricted', 'closed', 'intervals'].includes(day.mode) ||
        !Array.isArray(day.intervals) ||
        day.intervals.length > 1440 ||
        (day.mode === 'intervals'
          ? !day.intervals.length
          : day.intervals.length !== 0)
      )
        throw invalid();
      seen.add(day.day);
      const intervals = day.intervals
        .map((interval) => {
          if (
            !interval ||
            typeof interval !== 'object' ||
            Array.isArray(interval) ||
            Object.keys(interval).some(
              (key) => !['start', 'end'].includes(key),
            ) ||
            typeof interval.start !== 'string' ||
            typeof interval.end !== 'string' ||
            !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(interval.start) ||
            !/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/.test(interval.end) ||
            interval.start >= interval.end
          )
            throw invalid();
          return { start: interval.start, end: interval.end };
        })
        .sort((a, b) => a.start.localeCompare(b.start));
      if (
        intervals.some(
          (interval, index) =>
            index > 0 && intervals[index - 1]!.end > interval.start,
        )
      )
        throw invalid();
      return { day: day.day, mode: day.mode, intervals };
    })
    .sort((a, b) => a.day - b.day);
  return { timezone: body.timezone, version: body.version as number, days };
}

export class WeeklyHoursService {
  constructor(private readonly pool: Pool) {}

  async execute(
    accountId: string,
    congregationId: string,
    action: 'get' | 'save',
    input?: unknown,
  ) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        congregationId,
      )
    )
      throw new BadRequestException('Identificador inválido.');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const access = await client.query(
        "SELECT m.id FROM membership m JOIN identity_account a ON a.id=m.account_id WHERE m.account_id=$1 AND m.congregation_id=$2 AND m.role='LOCAL_ADMIN' AND m.status='ACTIVE' AND a.email_verified=true FOR SHARE OF m,a",
        [accountId, congregationId],
      );
      if (!access.rowCount) throw new ForbiddenException('Acesso negado.');
      const current = (
        await client.query(
          'SELECT timezone, weekly_hours_version AS version FROM congregation WHERE id=$1 FOR UPDATE',
          [congregationId],
        )
      ).rows[0];
      const stored = (
        await client.query(
          'SELECT day, mode, intervals FROM weekly_hours_day WHERE congregation_id=$1 ORDER BY day',
          [congregationId],
        )
      ).rows as Day[];
      // JSONB does not preserve object key order. Normalize before comparison
      // so saving an unchanged form never creates a new version or history.
      for (const day of stored) {
        day.intervals = day.intervals.map(({ start, end }) => ({ start, end }));
      }
      const previous = {
        ...current,
        days: Array.from(
          { length: 7 },
          (_, day) =>
            stored.find((item) => item.day === day) ?? {
              day,
              mode: 'unrestricted',
              intervals: [],
            },
        ),
      };
      let result = previous;
      if (action === 'save') {
        const config = validate(input);
        if (config.version !== current.version)
          throw new ConflictException(
            'A configuração foi alterada por outro administrador. Recarregue antes de editar novamente.',
          );
        // No assignments exist in this release. Future assignment writes must lock
        // this congregation row too and enforce PRG-001 PM-05 before this update.
        if (
          config.timezone !== current.timezone ||
          JSON.stringify(config.days) !== JSON.stringify(previous.days)
        ) {
          await client.query(
            'DELETE FROM weekly_hours_day WHERE congregation_id=$1',
            [congregationId],
          );
          for (const day of config.days) {
            if (day.mode !== 'unrestricted')
              await client.query(
                'INSERT INTO weekly_hours_day (congregation_id,day,mode,intervals) VALUES ($1,$2,$3,$4)',
                [
                  congregationId,
                  day.day,
                  day.mode,
                  JSON.stringify(day.intervals),
                ],
              );
          }
          result = {
            timezone: config.timezone,
            version: current.version + 1,
            days: config.days,
          };
          await client.query(
            'UPDATE congregation SET timezone=$2,weekly_hours_version=$3 WHERE id=$1',
            [congregationId, result.timezone, result.version],
          );
          await client.query(
            'INSERT INTO weekly_hours_history (id,congregation_id,actor_account_id,previous,configuration) VALUES ($1,$2,$3,$4,$5)',
            [
              randomUUID(),
              congregationId,
              accountId,
              JSON.stringify(previous),
              JSON.stringify(result),
            ],
          );
        }
      }
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
