import { randomInt, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import type { Pool } from 'pg';
import { reservationAccess } from './reservations.service.js';

export class PublisherRegistrationService {
  constructor(private readonly pool: Pool) {}
  async profile(accountId: string, input?: unknown) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const account = await client.query(
        'SELECT id FROM identity_account WHERE id=$1 AND email_verified FOR UPDATE',
        [accountId],
      );
      if (!account.rowCount)
        throw new ForbiddenException('Confirme seu e-mail antes de continuar.');
      if (input !== undefined) {
        const body = input as { displayName?: unknown; phone?: unknown };
        if (
          !body ||
          typeof body !== 'object' ||
          Array.isArray(body) ||
          Object.keys(body).some(
            (k) => !['displayName', 'phone'].includes(k),
          ) ||
          typeof body.displayName !== 'string' ||
          !body.displayName.trim() ||
          body.displayName.trim().length > 120 ||
          /[\p{Cc}\p{Cf}]/u.test(body.displayName) ||
          typeof body.phone !== 'string' ||
          !/^[+()\d .-]{8,30}$/.test(body.phone.trim()) ||
          body.phone.replace(/\D/g, '').length < 8
        )
          throw new BadRequestException(
            'Informe nome de até 120 caracteres e telefone válido.',
          );
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        // ON CONFLICT(code) retries collisions without aborting the transaction.
        for (;;) {
          const code = Array.from(
            { length: 10 },
            () => alphabet[randomInt(alphabet.length)],
          ).join('');
          const saved = await client.query(
            'INSERT INTO publisher_registration (account_id,code,display_name,phone) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING account_id',
            [accountId, code, body.displayName.trim(), body.phone.trim()],
          );
          if (
            saved.rowCount ||
            (
              await client.query(
                'SELECT 1 FROM publisher_registration WHERE account_id=$1',
                [accountId],
              )
            ).rowCount
          )
            break;
        }
        await client.query(
          'UPDATE publisher_registration SET display_name=$2,phone=$3 WHERE account_id=$1',
          [accountId, body.displayName.trim(), body.phone.trim()],
        );
      }
      const result =
        (
          await client.query(
            'SELECT r.code,r.display_name AS "displayName",r.phone,a.email FROM publisher_registration r JOIN identity_account a ON a.id=r.account_id WHERE r.account_id=$1',
            [accountId],
          )
        ).rows[0] ?? null;
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async approve(accountId: string, congregationId: string, input: unknown) {
    const body = input as { code?: unknown };
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).length !== 1 ||
      typeof body.code !== 'string' ||
      !/^[A-Z0-9]{10}$/.test(body.code.trim().toUpperCase())
    )
      throw new BadRequestException(
        'Informe o código de dez letras e números.',
      );
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const actor = await reservationAccess(client, accountId, congregationId);
      if (actor.role !== 'LOCAL_ADMIN')
        throw new ForbiddenException('Acesso restrito ao administrador local.');
      const target = (
        await client.query(
          'SELECT r.* FROM publisher_registration r JOIN identity_account a ON a.id=r.account_id WHERE r.code=$1 AND a.email_verified FOR SHARE OF r,a',
          [body.code.trim().toUpperCase()],
        )
      ).rows[0];
      if (!target) throw new NotFoundException('Código não encontrado.');
      await client.query('SELECT id FROM congregation WHERE id=$1 FOR UPDATE', [
        congregationId,
      ]);
      const existing = (
        await client.query(
          'SELECT id,status FROM membership WHERE account_id=$1 AND congregation_id=$2',
          [target.account_id, congregationId],
        )
      ).rows[0];
      if (existing?.status === 'REVOKED')
        throw new ConflictException(
          'Vínculo revogado. Use a ação Reativar nos vínculos da congregação.',
        );
      if (!existing) {
        const id = randomUUID();
        await client.query(
          "INSERT INTO membership (id,account_id,congregation_id,role,status) VALUES ($1,$2,$3,'PUBLISHER','ACTIVE')",
          [id, target.account_id, congregationId],
        );
        await client.query(
          'INSERT INTO publisher_profile (account_id,congregation_id,display_name,phone) VALUES ($1,$2,$3,$4)',
          [
            target.account_id,
            congregationId,
            target.display_name,
            target.phone,
          ],
        );
        await client.query(
          "INSERT INTO identity_audit_event (id,event_type,outcome,actor_account_id,subject_account_id,congregation_id,membership_id) VALUES ($1,'MEMBERSHIP_APPROVED','SUCCEEDED',$2,$3,$4,$5)",
          [randomUUID(), accountId, target.account_id, congregationId, id],
        );
      }
      await client.query('COMMIT');
      return { approved: true, displayName: target.display_name };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
