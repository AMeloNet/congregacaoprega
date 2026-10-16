import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { followingMonth, localMonth } from './monthly-schedule.service.js';
import { localParts, nextDate } from './reservation-time.js';
import {
  createReservation,
  lockReservationOwner,
  reservationAccess,
  uuidPattern,
} from './reservations.service.js';

export function weeklyDates(month: string, weekday: number) {
  const dates: string[] = [];
  for (
    let date = `${month}-01`;
    date.startsWith(`${month}-`);
    date = nextDate(date)
  ) {
    if (new Date(`${date}T12:00:00Z`).getUTCDay() === weekday) dates.push(date);
  }
  return dates;
}

export class RecurrenceService {
  constructor(
    private readonly pool: Pool,
    private readonly now = () => new Date(),
  ) {}

  async activate(
    accountId: string,
    congregationId: string,
    reservationId: string,
  ) {
    if (!uuidPattern.test(reservationId))
      throw new BadRequestException('Reserva inválida.');
    const client = await this.pool.connect();
    let seriesId: string;
    try {
      await client.query('BEGIN');
      const member = await reservationAccess(client, accountId, congregationId);
      const source = (
        await client.query(
          'SELECT * FROM reservation WHERE id=$1 AND congregation_id=$2 AND cancelled_at IS NULL',
          [reservationId, congregationId],
        )
      ).rows[0];
      if (!source) throw new NotFoundException('Reserva não encontrada.');
      if (
        source.responsible_account_id !== accountId &&
        member.role !== 'LOCAL_ADMIN'
      )
        throw new ForbiddenException(
          'Somente o responsável ou administrador pode ativar a recorrência.',
        );
      await reservationAccess(
        client,
        source.responsible_account_id,
        congregationId,
      );
      await lockReservationOwner(client, source.responsible_account_id);
      const congregation = (
        await client.query(
          'SELECT timezone FROM congregation WHERE id=$1 FOR UPDATE',
          [congregationId],
        )
      ).rows[0];
      const current = localMonth(this.now(), congregation.timezone);
      const months = [current, followingMonth(current)];
      if (
        !months.includes(source.local_date.slice(0, 7)) ||
        new Date(source.starts_at) <= this.now()
      )
        throw new BadRequestException(
          'Ative a recorrência de uma reserva futura no mês atual ou seguinte.',
        );
      const state =
        (
          await client.query(
            'SELECT state FROM schedule_month WHERE congregation_id=$1 AND month=$2',
            [congregationId, source.local_date.slice(0, 7)],
          )
        ).rows[0]?.state ?? 'open';
      if (
        state === 'finalized' ||
        (state === 'reopened' && member.role !== 'LOCAL_ADMIN')
      )
        throw new ConflictException(
          'Mês bloqueado para ativação da recorrência.',
        );
      const existing = (
        await client.query(
          'SELECT s.id,s.stopped_at FROM reservation_series s JOIN recurrence_occurrence o ON o.series_id=s.id WHERE o.reservation_id=$1',
          [reservationId],
        )
      ).rows[0];
      if (existing?.stopped_at)
        throw new ConflictException(
          'Esta recorrência foi encerrada. Uma nova série exige uma nova reserva.',
        );
      if (existing) seriesId = existing.id;
      else {
        const duplicate = await client.query(
          `SELECT 1 FROM reservation_series s JOIN reservation r ON r.id=s.source_reservation_id WHERE s.stopped_at IS NULL AND r.responsible_account_id=$1 AND r.congregation_id=$2 AND r.start_hour=$3 AND extract(dow FROM r.local_date::date)=extract(dow FROM $4::date)`,
          [
            source.responsible_account_id,
            congregationId,
            source.start_hour,
            source.local_date,
          ],
        );
        if (duplicate.rowCount)
          throw new ConflictException(
            'Já existe recorrência ativa para este dia da semana e horário.',
          );
        seriesId = randomUUID();
        await client.query(
          'INSERT INTO reservation_series (id,source_reservation_id,started_by_account_id) VALUES ($1,$2,$3)',
          [seriesId, reservationId, accountId],
        );
        await client.query(
          'INSERT INTO recurrence_occurrence (id,series_id,local_date,reservation_id) VALUES ($1,$2,$3,$4)',
          [randomUUID(), seriesId, source.local_date, reservationId],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    const result = await this.generate(seriesId, congregationId, { accountId });
    return { id: seriesId, ...result };
  }

  async stop(accountId: string, congregationId: string, seriesId: string) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const member = await reservationAccess(client, accountId, congregationId);
      const source = await this.source(client, seriesId, congregationId);
      if (
        source.responsible_account_id !== accountId &&
        member.role !== 'LOCAL_ADMIN'
      )
        throw new ForbiddenException(
          'Somente o responsável ou administrador pode encerrar a recorrência.',
        );
      await lockReservationOwner(client, source.responsible_account_id);
      await client.query('SELECT id FROM congregation WHERE id=$1 FOR UPDATE', [
        congregationId,
      ]);
      // Ending the template changes no existing designation, even in a locked month.
      await client.query(
        'UPDATE reservation_series SET stopped_at=coalesce(stopped_at,$2),stopped_by_account_id=coalesce(stopped_by_account_id,$3) WHERE id=$1',
        [seriesId, this.now(), accountId],
      );
      await client.query('COMMIT');
      return { id: seriesId, stopped: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async source(client: PoolClient, id: string, congregationId: string) {
    if (!uuidPattern.test(id))
      throw new BadRequestException('Recorrência inválida.');
    const source = (
      await client.query(
        'SELECT r.*,s.stopped_at FROM reservation_series s JOIN reservation r ON r.id=s.source_reservation_id WHERE s.id=$1 AND r.congregation_id=$2',
        [id, congregationId],
      )
    ).rows[0];
    if (!source) throw new NotFoundException('Recorrência não encontrada.');
    return source;
  }

  async generate(
    seriesId: string,
    congregationId: string,
    actor?: { accountId: string; retryDate?: string },
  ) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      let role = 'PUBLISHER';
      if (actor)
        role = (
          await reservationAccess(client, actor.accountId, congregationId)
        ).role;
      let source = await this.source(client, seriesId, congregationId);
      if (
        actor &&
        source.responsible_account_id !== actor.accountId &&
        role !== 'LOCAL_ADMIN'
      )
        throw new ForbiddenException('Acesso negado à recorrência.');
      // Lock eligibility without throwing: a revoked owner produces explicit failures.
      const eligible = await client.query(
        "SELECT m.id FROM membership m JOIN identity_account a ON a.id=m.account_id WHERE m.account_id=$1 AND m.congregation_id=$2 AND m.status='ACTIVE' AND a.email_verified=true FOR SHARE OF m,a",
        [source.responsible_account_id, congregationId],
      );
      await lockReservationOwner(client, source.responsible_account_id);
      const congregation = (
        await client.query(
          'SELECT timezone FROM congregation WHERE id=$1 FOR UPDATE',
          [congregationId],
        )
      ).rows[0];
      source = await this.source(client, seriesId, congregationId);
      if (source.stopped_at) {
        if (actor) throw new ConflictException('Recorrência encerrada.');
        await client.query('COMMIT');
        return { generated: 0, conflicts: [] };
      }
      const now = this.now(),
        current = localMonth(now, congregation.timezone);
      const localNow = localParts(now, congregation.timezone);
      const weekday = new Date(`${source.local_date}T12:00:00Z`).getUTCDay();
      const allowedMonths = [current, followingMonth(current)];
      const dates = [current, followingMonth(current)]
        .flatMap((month) => weeklyDates(month, weekday))
        .filter(
          (date) =>
            source.start_hour + source.duration < 24 ||
            allowedMonths.includes(nextDate(date).slice(0, 7)),
        )
        .filter(
          (date) =>
            date >= source.local_date &&
            (date > localNow.date ||
              (date === localNow.date && source.start_hour > localNow.hour)),
        );
      if (actor?.retryDate && !dates.includes(actor.retryDate))
        throw new BadRequestException(
          'Ocorrência fora do período futuro liberado.',
        );
      let generated = 0;
      const conflicts: { date: string; message: string }[] = [];
      for (const date of dates) {
        if (actor?.retryDate && date !== actor.retryDate) continue;
        const occurrence = (
          await client.query(
            'SELECT * FROM recurrence_occurrence WHERE series_id=$1 AND local_date=$2',
            [seriesId, date],
          )
        ).rows[0];
        if (occurrence?.reservation_id) continue;
        if (occurrence && !actor?.retryDate) {
          conflicts.push({ date, message: occurrence.error });
          continue;
        }
        const id = occurrence?.id ?? randomUUID();
        await client.query('SAVEPOINT occurrence_attempt');
        try {
          if (!eligible.rowCount)
            throw new ForbiddenException(
              'Responsável sem vínculo ativo ou e-mail verificado.',
            );
          const reservation = await createReservation(
            client,
            source.responsible_account_id,
            congregationId,
            role,
            congregation.timezone,
            {
              requestKey: id,
              pointId: source.point_id,
              date,
              startHour: source.start_hour,
              duration: source.duration,
              equipmentType: source.equipment_type,
              thirdPositionOpen: source.third_position_open,
            },
            now,
          );
          await client.query(
            'INSERT INTO recurrence_occurrence (id,series_id,local_date,reservation_id,attempts) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (series_id,local_date) DO UPDATE SET reservation_id=EXCLUDED.reservation_id,error=NULL,attempted_at=now(),attempts=recurrence_occurrence.attempts || EXCLUDED.attempts',
            [
              id,
              seriesId,
              date,
              reservation.id,
              JSON.stringify([
                {
                  at: now.toISOString(),
                  actorAccountId: actor?.accountId ?? null,
                  reservationId: reservation.id,
                  error: null,
                },
              ]),
            ],
          );
          generated++;
        } catch (error) {
          await client.query('ROLLBACK TO SAVEPOINT occurrence_attempt');
          if (!(error instanceof HttpException) || error.getStatus() >= 500)
            throw error;
          const response = error.getResponse();
          const message =
            typeof response === 'string'
              ? response
              : (response as { message: string }).message;
          await client.query(
            'INSERT INTO recurrence_occurrence (id,series_id,local_date,error,attempts) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (series_id,local_date) DO UPDATE SET error=EXCLUDED.error,attempted_at=now(),attempts=recurrence_occurrence.attempts || EXCLUDED.attempts',
            [
              id,
              seriesId,
              date,
              message,
              JSON.stringify([
                {
                  at: now.toISOString(),
                  actorAccountId: actor?.accountId ?? null,
                  reservationId: null,
                  error: message,
                },
              ]),
            ],
          );
          conflicts.push({ date, message });
        } finally {
          await client.query('RELEASE SAVEPOINT occurrence_attempt');
        }
      }
      await client.query('COMMIT');
      return { generated, conflicts };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async generateAll() {
    const series = (
      await this.pool.query(
        'SELECT s.id,r.congregation_id FROM reservation_series s JOIN reservation r ON r.id=s.source_reservation_id WHERE s.stopped_at IS NULL ORDER BY s.id',
      )
    ).rows;
    for (const item of series)
      await this.generate(item.id, item.congregation_id);
  }
}
