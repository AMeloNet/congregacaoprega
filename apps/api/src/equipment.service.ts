import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';

export class EquipmentService {
  constructor(private readonly pool: Pool) {}

  async execute(
    accountId: string,
    congregationId: string,
    action: 'list' | 'create' | 'state',
    input?: unknown,
    equipmentId?: string,
  ) {
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (
      !uuid.test(congregationId) ||
      (equipmentId !== undefined && !uuid.test(equipmentId))
    )
      throw new BadRequestException('Identificador inválido.');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const access = await client.query(
        `SELECT m.id FROM membership m JOIN identity_account a ON a.id=m.account_id WHERE m.account_id=$1 AND m.congregation_id=$2 AND m.role='LOCAL_ADMIN' AND m.status='ACTIVE' AND a.email_verified=true FOR SHARE OF m, a`,
        [accountId, congregationId],
      );
      if (!access.rowCount) throw new ForbiddenException('Acesso negado.');
      if (action !== 'list')
        await client.query(
          'SELECT id FROM congregation WHERE id=$1 FOR UPDATE',
          [congregationId],
        );
      let result;
      if (action === 'list') {
        result = (
          await client.query(
            'SELECT id, name, type, active, observation FROM equipment WHERE congregation_id=$1 ORDER BY lower(name), id',
            [congregationId],
          )
        ).rows;
      } else {
        if (!input || typeof input !== 'object' || Array.isArray(input))
          throw new BadRequestException('Dados inválidos.');
        const body = input as Record<string, unknown>;
        const allowed =
          action === 'create'
            ? ['name', 'type', 'observation']
            : ['active', 'observation'];
        if (Object.keys(body).some((key) => !allowed.includes(key)))
          throw new BadRequestException('Campo inválido.');
        if (
          body.observation !== undefined &&
          typeof body.observation !== 'string'
        )
          throw new BadRequestException('Observação inválida.');
        const observation =
          (body.observation as string | undefined)?.trim() ?? '';
        if ([...observation].length > 250)
          throw new BadRequestException(
            'A observação deve ter até 250 caracteres.',
          );
        if (action === 'create') {
          const name = typeof body.name === 'string' ? body.name.trim() : '';
          if (
            !name ||
            [...name].length > 80 ||
            typeof body.type !== 'string' ||
            !['CART', 'KIOSK', 'DISPLAY'].includes(body.type)
          )
            throw new BadRequestException(
              'Informe nome de 1 a 80 caracteres e tipo válido.',
            );
          result = (
            await client.query(
              'INSERT INTO equipment (id, congregation_id, name, type, observation) VALUES ($1,$2,$3,$4,$5) RETURNING id, name, type, active, observation',
              [randomUUID(), congregationId, name, body.type, observation],
            )
          ).rows[0];
          await this.history(client, result.id, accountId, true, observation);
        } else {
          if (typeof body.active !== 'boolean')
            throw new BadRequestException('Estado inválido.');
          const existing = (
            await client.query(
              'SELECT active,type FROM equipment WHERE id=$1 AND congregation_id=$2 FOR UPDATE',
              [equipmentId, congregationId],
            )
          ).rows[0];
          if (!existing)
            throw new NotFoundException('Equipamento não encontrado.');
          if (existing.active === body.active)
            throw new ConflictException('O equipamento já está nesse estado.');
          if (!body.active) {
            const conflict = await client.query(
              `SELECT 1 FROM reservation r WHERE r.congregation_id=$1 AND r.equipment_type=$2 AND r.cancelled_at IS NULL AND r.ends_at>now() AND (SELECT count(*) FROM reservation other WHERE other.congregation_id=$1 AND other.equipment_type=$2 AND other.cancelled_at IS NULL AND other.starts_at<=greatest(r.starts_at,now()) AND other.ends_at>greatest(r.starts_at,now())) > (SELECT count(*)-1 FROM equipment WHERE congregation_id=$1 AND type=$2 AND active) LIMIT 1`,
              [congregationId, existing.type],
            );
            if (conflict.rowCount)
              throw new ConflictException(
                'Existem reservas que ficariam sem equipamento disponível. Resolva o conflito antes de inativar.',
              );
          }
          result = (
            await client.query(
              'UPDATE equipment SET active=$3, observation=$4 WHERE id=$1 AND congregation_id=$2 RETURNING id, name, type, active, observation',
              [equipmentId, congregationId, body.active, observation],
            )
          ).rows[0];
          await this.history(
            client,
            equipmentId!,
            accountId,
            body.active,
            observation,
          );
        }
      }
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      if ((error as { code?: string }).code === '23505')
        throw new ConflictException(
          'Já existe equipamento com esse nome na congregação.',
        );
      throw error;
    } finally {
      client.release();
    }
  }

  private async history(
    client: PoolClient,
    id: string,
    actor: string,
    active: boolean,
    observation: string,
  ) {
    await client.query(
      'INSERT INTO equipment_state_history (id, equipment_id, actor_account_id, active, observation) VALUES ($1,$2,$3,$4,$5)',
      [randomUUID(), id, actor, active, observation],
    );
  }
}
