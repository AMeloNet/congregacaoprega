import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { Pool } from 'pg';
import { reservationAccess, uuidPattern } from './reservations.service.js';
export class PublisherProfilesService {
  constructor(private readonly pool: Pool) {}
  async execute(
    accountId: string,
    congregationId: string,
    target = accountId,
    input?: unknown,
  ) {
    if (!uuidPattern.test(target))
      throw new BadRequestException('Publicador inválido.');
    let name: string | undefined;
    if (input !== undefined) {
      const body = input as { displayName: string };
      if (
        !body ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        Object.keys(body).length !== 1 ||
        typeof body.displayName !== 'string' ||
        body.displayName.trim().length < 1 ||
        body.displayName.trim().length > 120 ||
        /[\p{Cc}\p{Cf}]/u.test(body.displayName)
      )
        throw new BadRequestException(
          'Informe somente o nome, com 1 a 120 caracteres.',
        );
      name = body.displayName.trim();
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const member = await reservationAccess(client, accountId, congregationId);
      if (target !== accountId && member.role !== 'LOCAL_ADMIN')
        throw new ForbiddenException(
          'Acesso negado ao nome de outro publicador.',
        );
      const targetMember = await client.query(
        'SELECT id FROM membership WHERE account_id=$1 AND congregation_id=$2 FOR SHARE',
        [target, congregationId],
      );
      if (!targetMember.rowCount)
        throw new NotFoundException('Publicador não encontrado.');
      await client.query('SELECT id FROM congregation WHERE id=$1 FOR UPDATE', [
        congregationId,
      ]);
      const previous =
        (
          await client.query(
            'SELECT display_name FROM publisher_profile WHERE account_id=$1 AND congregation_id=$2',
            [target, congregationId],
          )
        ).rows[0]?.display_name ?? '';
      if (name !== undefined && name !== previous)
        await client.query(
          'INSERT INTO publisher_profile (account_id,congregation_id,display_name,changes) VALUES ($1,$2,$3,$4) ON CONFLICT (account_id,congregation_id) DO UPDATE SET display_name=EXCLUDED.display_name,changes=publisher_profile.changes||EXCLUDED.changes',
          [
            target,
            congregationId,
            name,
            JSON.stringify([
              {
                actorAccountId: accountId,
                at: new Date().toISOString(),
                previous,
                displayName: name,
              },
            ]),
          ],
        );
      await client.query('COMMIT');
      return { accountId: target, displayName: name ?? previous };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async directory(accountId: string, congregationId: string) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const member = await reservationAccess(client, accountId, congregationId);
      if (member.role !== 'LOCAL_ADMIN')
        throw new ForbiddenException('Acesso restrito ao administrador local.');
      const result = (
        await client.query(
          'SELECT a.id,a.email,p.display_name AS "displayName",m.role,m.status,a.email_verified AS verified FROM membership m JOIN identity_account a ON a.id=m.account_id LEFT JOIN publisher_profile p ON p.account_id=m.account_id AND p.congregation_id=m.congregation_id WHERE m.congregation_id=$1 ORDER BY lower(coalesce(p.display_name,a.email)),a.id',
          [congregationId],
        )
      ).rows;
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
