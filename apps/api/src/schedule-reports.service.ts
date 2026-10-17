import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import { reservationAccess, uuidPattern } from './reservations.service.js';
import { localMonth, followingMonth } from './monthly-schedule.service.js';
import { alertRecipients, notice } from './reservation-groups.js';

export class ScheduleReportsService {
  constructor(
    private readonly pool: Pool,
    private readonly now = () => new Date(),
  ) {}
  private async access(
    client: PoolClient,
    accountId: string,
    congregationId: string,
  ) {
    const member = await reservationAccess(client, accountId, congregationId);
    if (member.role !== 'LOCAL_ADMIN')
      throw new ForbiddenException(
        'Relatório restrito ao administrador local.',
      );
    return (
      await client.query(
        'SELECT name,timezone FROM congregation WHERE id=$1 FOR UPDATE',
        [congregationId],
      )
    ).rows[0];
  }
  private validMonth(month: string, timezone?: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
      throw new BadRequestException('Mês inválido.');
    if (timezone) {
      const current = localMonth(this.now(), timezone);
      if (![current, followingMonth(current)].includes(month))
        throw new BadRequestException('Escolha o mês atual ou seguinte.');
    }
  }
  private serialized(row: QueryResultRow) {
    return {
      id: row.id,
      version: row.version,
      createdAt: row.created_at,
      snapshot: row.snapshot,
    };
  }
  private async build(
    client: PoolClient,
    congregationId: string,
    month: string,
    c: { name: string; timezone: string },
    now: Date,
  ) {
    const reservations = (
      await client.query(
        'SELECT r.id,r.local_date,r.start_hour,r.duration,r.equipment_type,p.name AS point_name FROM reservation r JOIN preaching_point p ON p.id=r.point_id WHERE r.congregation_id=$1 AND substring(r.local_date,1,7)=$2 AND r.cancelled_at IS NULL ORDER BY r.local_date,r.start_hour,lower(p.name),r.id',
        [congregationId, month],
      )
    ).rows;
    const roster = (
      await client.query(
        `SELECT roster.*,p.display_name FROM (
    SELECT r.id AS reservation_id,r.responsible_account_id AS account_id,1 AS position,'confirmed' AS status FROM reservation r WHERE r.congregation_id=$1 AND substring(r.local_date,1,7)=$2 AND r.cancelled_at IS NULL
    UNION ALL SELECT r.id,a.account_id,a.position,'confirmed' FROM reservation_participation a JOIN reservation r ON r.id=a.reservation_id WHERE r.congregation_id=$1 AND substring(r.local_date,1,7)=$2 AND r.cancelled_at IS NULL
    UNION ALL SELECT r.id,i.recipient_account_id,i.position,'pending' FROM reservation_invitation i JOIN reservation r ON r.id=i.reservation_id WHERE r.congregation_id=$1 AND substring(r.local_date,1,7)=$2 AND r.cancelled_at IS NULL AND i.state='pending' AND i.expires_at>$3
   ) roster LEFT JOIN publisher_profile p ON p.account_id=roster.account_id AND p.congregation_id=$1 ORDER BY roster.reservation_id,roster.position`,
        [congregationId, month, now],
      )
    ).rows;
    const missingNames = [
      ...new Set(
        roster
          .filter((p) => !p.display_name)
          .map((p) => p.account_id as string),
      ),
    ];
    const snapshot = {
      schemaVersion: 1,
      title: 'Testemunho Público',
      congregationName: c.name,
      timezone: c.timezone,
      month,
      entries: reservations.map((r) => ({
        id: r.id,
        date: r.local_date,
        weekday: new Date(`${r.local_date}T12:00:00Z`).getUTCDay(),
        pointName: r.point_name,
        startHour: r.start_hour,
        duration: r.duration,
        equipmentType: r.equipment_type,
        crossesMidnight: r.start_hour + r.duration >= 24,
        participants: roster
          .filter((p) => p.reservation_id === r.id)
          .map((p) => ({
            name: p.display_name ?? null,
            status: p.status,
            responsible: p.position === 1,
          })),
      })),
    };
    return {
      snapshot,
      missingNames,
      recipients: [...new Set(roster.map((p) => p.account_id as string))],
    };
  }
  async preview(accountId: string, congregationId: string, month: string) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const c = await this.access(client, accountId, congregationId);
      this.validMonth(month, c.timezone);
      const now = this.now(),
        built = await this.build(client, congregationId, month, c, now);
      const reports = (
        await client.query(
          'SELECT id,version,created_at AS "createdAt" FROM schedule_report WHERE congregation_id=$1 AND month=$2 ORDER BY version DESC',
          [congregationId, month],
        )
      ).rows;
      const state =
        (
          await client.query(
            'SELECT state FROM schedule_month WHERE congregation_id=$1 AND month=$2',
            [congregationId, month],
          )
        ).rows[0]?.state ?? 'open';
      await client.query('COMMIT');
      return {
        draft: true,
        state,
        snapshot: built.snapshot,
        missingNames: built.missingNames,
        reports,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async get(accountId: string, congregationId: string, reportId: string) {
    if (!uuidPattern.test(reportId))
      throw new BadRequestException('Relatório inválido.');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.access(client, accountId, congregationId);
      const r = (
        await client.query(
          'SELECT * FROM schedule_report WHERE id=$1 AND congregation_id=$2',
          [reportId, congregationId],
        )
      ).rows[0];
      if (!r) throw new NotFoundException('Relatório não encontrado.');
      await client.query('COMMIT');
      return this.serialized(r);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async finalize(
    accountId: string,
    congregationId: string,
    month: string,
    input: unknown,
  ) {
    const body = input as { requestKey: string };
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).length !== 1 ||
      !uuidPattern.test(body.requestKey ?? '')
    )
      throw new BadRequestException('Informe somente a chave de emissão.');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const c = await this.access(client, accountId, congregationId);
      this.validMonth(month, c.timezone);
      const previous = (
        await client.query(
          'SELECT * FROM schedule_report WHERE congregation_id=$1 AND actor_account_id=$2 AND request_key=$3',
          [congregationId, accountId, body.requestKey],
        )
      ).rows[0];
      if (previous) {
        if (previous.month !== month)
          throw new ConflictException('Chave já usada para outro mês.');
        await client.query('COMMIT');
        return this.serialized(previous);
      }
      const state =
        (
          await client.query(
            'SELECT state FROM schedule_month WHERE congregation_id=$1 AND month=$2',
            [congregationId, month],
          )
        ).rows[0]?.state ?? 'open';
      const latest = (
        await client.query(
          'SELECT * FROM schedule_report WHERE congregation_id=$1 AND month=$2 ORDER BY version DESC LIMIT 1',
          [congregationId, month],
        )
      ).rows[0];
      if (state === 'finalized' && latest) {
        await client.query('COMMIT');
        return this.serialized(latest);
      }
      const now = this.now(),
        built = await this.build(client, congregationId, month, c, now);
      if (built.missingNames.length)
        throw new ConflictException({
          code: 'PUBLISHER_NAMES_REQUIRED',
          message:
            'Cadastre os nomes dos confirmados e convidados pendentes em Administração antes de emitir o relatório.',
          missingNames: built.missingNames,
        });
      await client.query(
        "INSERT INTO schedule_month (congregation_id,month,state) VALUES ($1,$2,'finalized') ON CONFLICT (congregation_id,month) DO UPDATE SET state='finalized'",
        [congregationId, month],
      );
      if (state !== 'finalized')
        await client.query(
          "INSERT INTO schedule_month_history (id,congregation_id,month,actor_account_id,previous_state,state,created_at) VALUES ($1,$2,$3,$4,$5,'finalized',$6)",
          [randomUUID(), congregationId, month, accountId, state, now],
        );
      const report = (
        await client.query(
          'INSERT INTO schedule_report (id,congregation_id,month,version,actor_account_id,request_key,snapshot,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
          [
            randomUUID(),
            congregationId,
            month,
            (latest?.version ?? 0) + 1,
            accountId,
            body.requestKey,
            JSON.stringify(built.snapshot),
            now,
          ],
        )
      ).rows[0];
      await notice(
        client,
        congregationId,
        [
          ...built.recipients,
          ...(await alertRecipients(client, congregationId)),
        ],
        `schedule-report:${report.id}`,
        `A programação de ${month.split('-').reverse().join('/')} foi finalizada. Versão ${report.version} emitida; alterações de publicadores estão bloqueadas.`,
        now,
      );
      await client.query('COMMIT');
      return this.serialized(report);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
