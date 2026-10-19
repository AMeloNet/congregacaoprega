import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { Pool } from 'pg';
import { validatePointPhoto } from './point-photo.js';
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
    let phoneInput: string | undefined;
    let facePhoto: string | undefined;
    if (input !== undefined) {
      const body = input as {
        displayName: string;
        phone?: unknown;
        facePhoto?: unknown;
      };
      if (
        !body ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        Object.keys(body).some(
          (k) => !['displayName', 'phone', 'facePhoto'].includes(k),
        ) ||
        (body.phone !== undefined &&
          (typeof body.phone !== 'string' ||
            (body.phone !== '' &&
              (!/^[+()\d .-]{8,30}$/.test(body.phone.trim()) ||
                body.phone.replace(/\D/g, '').length < 8)))) ||
        typeof body.displayName !== 'string' ||
        body.displayName.trim().length < 1 ||
        body.displayName.trim().length > 120 ||
        /[\p{Cc}\p{Cf}]/u.test(body.displayName)
      )
        throw new BadRequestException(
          'Informe nome de 1 a 120 caracteres e telefone válido.',
        );
      name = body.displayName.trim();
      phoneInput =
        body.phone === undefined ? undefined : (body.phone as string).trim();
      if (body.facePhoto !== undefined)
        facePhoto = validatePointPhoto(body.facePhoto);
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const member = await reservationAccess(client, accountId, congregationId);
      if (target !== accountId && member.role !== 'LOCAL_ADMIN')
        throw new ForbiddenException(
          'Acesso negado ao nome de outro publicador.',
        );
      if (target !== accountId && facePhoto !== undefined)
        throw new ForbiddenException(
          'A foto de rosto só pode ser alterada pela própria pessoa.',
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
      if (input !== undefined && phoneInput !== undefined) {
        const phone = phoneInput;
        const old =
          (
            await client.query(
              'SELECT phone FROM publisher_profile WHERE account_id=$1 AND congregation_id=$2',
              [target, congregationId],
            )
          ).rows[0]?.phone ?? '';
        if (phone !== old)
          await client.query(
            'UPDATE publisher_profile SET phone=$3,changes=changes||$4::jsonb WHERE account_id=$1 AND congregation_id=$2',
            [
              target,
              congregationId,
              phone,
              JSON.stringify([
                {
                  actorAccountId: accountId,
                  at: new Date().toISOString(),
                  previousPhone: old,
                  phone,
                },
              ]),
            ],
          );
      }
      if (facePhoto !== undefined) {
        const old =
          (
            await client.query(
              'SELECT face_photo FROM publisher_profile WHERE account_id=$1 AND congregation_id=$2',
              [target, congregationId],
            )
          ).rows[0]?.face_photo ?? '';
        if (facePhoto !== old)
          await client.query(
            'UPDATE publisher_profile SET face_photo=$3,changes=changes||$4::jsonb WHERE account_id=$1 AND congregation_id=$2',
            [
              target,
              congregationId,
              facePhoto,
              JSON.stringify([
                {
                  actorAccountId: accountId,
                  at: new Date().toISOString(),
                  previousFacePhoto: Boolean(old),
                  hasFacePhoto: Boolean(facePhoto),
                },
              ]),
            ],
          );
      }
      const profile = (
        await client.query(
          'SELECT phone,face_photo AS "facePhoto" FROM publisher_profile WHERE account_id=$1 AND congregation_id=$2',
          [target, congregationId],
        )
      ).rows[0] ?? { phone: '', facePhoto: '' };
      const email =
        (
          await client.query('SELECT email FROM identity_account WHERE id=$1', [
            target,
          ])
        ).rows[0]?.email ?? '';
      await client.query('COMMIT');
      return {
        accountId: target,
        displayName: name ?? previous,
        phone: profile.phone,
        facePhoto: profile.facePhoto,
        email,
      };
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
          'SELECT a.id,a.email,p.phone,p.display_name AS "displayName",m.role,m.status,a.email_verified AS verified FROM membership m JOIN identity_account a ON a.id=m.account_id LEFT JOIN publisher_profile p ON p.account_id=m.account_id AND p.congregation_id=m.congregation_id WHERE m.congregation_id=$1 ORDER BY lower(coalesce(p.display_name,a.email)),a.id',
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
