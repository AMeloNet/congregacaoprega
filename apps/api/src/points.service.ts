import { validatePointPhoto } from './point-photo.js';
import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { Pool } from 'pg';

export class PointsService {
  constructor(private readonly pool: Pool) {}

  async execute(
    accountId: string,
    congregationId: string,
    action: 'list' | 'create' | 'update' | 'photo',
    input?: unknown,
    pointId?: string,
  ) {
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (
      !uuid.test(congregationId) ||
      (pointId !== undefined && !uuid.test(pointId))
    )
      throw new BadRequestException('Identificador inválido.');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const access = await client.query(
        "SELECT m.id FROM membership m JOIN identity_account a ON a.id=m.account_id WHERE m.account_id=$1 AND m.congregation_id=$2 AND ($3::boolean OR m.role='LOCAL_ADMIN') AND m.status='ACTIVE' AND a.email_verified=true FOR SHARE OF m, a",
        [accountId, congregationId, action === 'photo'],
      );
      if (!access.rowCount) throw new ForbiddenException('Acesso negado.');
      if (action !== 'list' && action !== 'photo')
        await client.query(
          'SELECT id FROM congregation WHERE id=$1 FOR UPDATE',
          [congregationId],
        );
      const columns =
        'id, name, address, description, capacity, photo, allowed_types::text[] AS "allowedTypes"';
      let result;
      if (action === 'photo') {
        const row = (
          await client.query(
            'SELECT photo FROM preaching_point WHERE id=$1 AND congregation_id=$2',
            [pointId, congregationId],
          )
        ).rows[0];
        if (!row) throw new NotFoundException('Ponto não encontrado.');
        result = row;
      } else if (action === 'list') {
        result = (
          await client.query(
            `SELECT ${columns} FROM preaching_point WHERE congregation_id=$1 ORDER BY lower(name), id`,
            [congregationId],
          )
        ).rows;
      } else {
        if (!input || typeof input !== 'object' || Array.isArray(input))
          throw new BadRequestException('Dados inválidos.');
        const body = input as Record<string, unknown>;
        if (
          Object.keys(body).some(
            (key) =>
              ![
                'name',
                'address',
                'description',
                'capacity',
                'allowedTypes',
                'photo',
              ].includes(key),
          )
        )
          throw new BadRequestException('Campo inválido.');
        const photo =
          action === 'update' && body.photo === undefined
            ? null
            : validatePointPhoto(body.photo);
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!name || [...name].length > 80)
          throw new BadRequestException('Informe nome de 1 a 80 caracteres.');
        const optionalText = (value: unknown, label: string) => {
          if (value !== undefined && typeof value !== 'string')
            throw new BadRequestException(`${label} inválido.`);
          const text = (value as string | undefined)?.trim() ?? '';
          if ([...text].length > 250)
            throw new BadRequestException(
              `${label} deve ter até 250 caracteres.`,
            );
          return text;
        };
        const address = optionalText(body.address, 'Endereço');
        const description = optionalText(body.description, 'Descrição');
        const capacity =
          action === 'create' && body.capacity === undefined
            ? 1
            : body.capacity;
        if (
          typeof capacity !== 'number' ||
          !Number.isInteger(capacity) ||
          capacity < 1 ||
          capacity > 2147483647
        )
          throw new BadRequestException(
            'Capacidade deve ser um inteiro positivo.',
          );
        const types = body.allowedTypes;
        if (
          !Array.isArray(types) ||
          !types.length ||
          types.length > 3 ||
          new Set(types).size !== types.length ||
          types.some((type) => !['CART', 'KIOSK', 'DISPLAY'].includes(type))
        )
          throw new BadRequestException(
            'Selecione ao menos um tipo válido, sem repetições.',
          );
        const values = [
          action === 'create' ? randomUUID() : pointId,
          congregationId,
          name,
          address,
          description,
          capacity,
          types,
          photo,
        ];
        if (action === 'update') {
          const conflict = await client.query(
            `SELECT 1 FROM reservation r WHERE r.congregation_id=$1 AND r.point_id=$2 AND r.cancelled_at IS NULL AND r.ends_at>now() AND (NOT r.equipment_type=ANY($3::equipment_type[]) OR (SELECT count(*) FROM reservation other WHERE other.point_id=$2 AND other.cancelled_at IS NULL AND other.starts_at<=greatest(r.starts_at,now()) AND other.ends_at>greatest(r.starts_at,now()))>$4) LIMIT 1`,
            [congregationId, pointId, types, capacity],
          );
          if (conflict.rowCount)
            throw new ConflictException(
              'Existem reservas incompatíveis com a capacidade ou os tipos escolhidos. Resolva o conflito antes de alterar.',
            );
        }
        const query =
          action === 'create'
            ? `INSERT INTO preaching_point (id, congregation_id, name, address, description, capacity, allowed_types, photo) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${columns}`
            : `UPDATE preaching_point SET name=$3,address=$4,description=$5,capacity=$6,allowed_types=$7,photo=coalesce($8,photo) WHERE id=$1 AND congregation_id=$2 RETURNING ${columns}`;
        result = (await client.query(query, values)).rows[0];
        if (!result) throw new NotFoundException('Ponto não encontrado.');
      }
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      if ((error as { code?: string }).code === '23505')
        throw new ConflictException(
          'Já existe ponto com esse nome na congregação.',
        );
      throw error;
    } finally {
      client.release();
    }
  }
}
