import { randomUUID } from 'node:crypto';
import { CaptureEmailService } from '../../../apps/api/src/identity/email.service.js';
import { IdentityService } from '../../../apps/api/src/identity/identity.service.js';
import { PgIdentityRepository } from '../../../apps/api/src/identity/pg-identity.repository.js';
import { runPrisma, withDisposableDatabase } from './test-support/database.js';

describe('IDN-001C functional identity flows on PostgreSQL', () => {
  it('consumes bootstrap and membership invitations once and applies revocation immediately', async () => {
    await withDisposableDatabase(async (url, pool) => {
      expect(runPrisma(url, ['migrate', 'deploy'])).toBe(0);
      const repository = new PgIdentityRepository(pool);
      const email = new CaptureEmailService();
      const now = new Date('2026-09-21T12:00:00Z');
      const service = new IdentityService(repository, email, {
        appBaseUrl: 'https://app.example.test',
        bootstrapSecret: 'bootstrap-secret',
        now: () => now,
      });
      const congregationId = randomUUID();
      await pool.query('INSERT INTO congregation (id, name) VALUES ($1, $2)', [
        congregationId,
        'Congregação de Teste',
      ]);
      const master = await repository.syncExternalAccount({
        issuer: 'https://identity.example.test/',
        subject: 'master',
        email: 'master@example.test',
        emailVerified: true,
        csrfToken: 'not-persisted',
      });
      const local = await repository.syncExternalAccount({
        issuer: 'https://identity.example.test/',
        subject: 'local',
        email: 'local@example.test',
        emailVerified: true,
        csrfToken: 'not-persisted',
      });
      const publisher = await repository.syncExternalAccount({
        issuer: 'https://identity.example.test/',
        subject: 'publisher',
        email: 'publisher@example.test',
        emailVerified: true,
        csrfToken: 'not-persisted',
      });

      const bootstrap = await service.issueMasterBootstrap(
        'bootstrap-secret',
        master.email,
      );
      const stored = await pool.query<{ digest: string }>(
        `SELECT encode(token_digest, 'hex') AS digest
         FROM access_invitation WHERE id = $1`,
        [bootstrap.invitationId],
      );
      expect(stored.rows[0]!.digest).not.toContain(bootstrap.token);
      await service.acceptInvitation(master, bootstrap.token);
      await expect(
        service.acceptInvitation(master, bootstrap.token),
      ).rejects.toThrow('Convite indisponível.');

      const admin = await service.inviteMember(
        { ...master, isMaster: true },
        {
          congregationId,
          email: local.email,
          role: 'LOCAL_ADMIN',
        },
      );
      await service.acceptInvitation(local, admin.token);
      const invite = await service.inviteMember(local, {
        congregationId,
        email: publisher.email,
        role: 'PUBLISHER',
      });
      await service.acceptInvitation(publisher, invite.token);

      const membership = await repository.membership(
        publisher.accountId,
        congregationId,
      );
      expect(membership).toMatchObject({ role: 'PUBLISHER', status: 'ACTIVE' });
      await service.changeMembershipStatus(local, membership!.id, 'REVOKED');
      expect(
        await repository.membership(publisher.accountId, congregationId),
      ).toMatchObject({ status: 'REVOKED' });
      await service.changeMembershipStatus(local, membership!.id, 'ACTIVE');

      const audit = await pool.query<{ total: number }>(
        'SELECT count(*)::integer AS total FROM identity_audit_event',
      );
      expect(audit.rows[0]!.total).toBeGreaterThanOrEqual(5);
      expect(email.messages.map((item) => item.to)).toEqual([
        master.email,
        local.email,
        publisher.email,
        publisher.email,
        publisher.email,
      ]);
    });
  });

  it('keeps concurrent invitation consumption idempotent', async () => {
    await withDisposableDatabase(async (url, pool) => {
      expect(runPrisma(url, ['migrate', 'deploy'])).toBe(0);
      const congregationId = randomUUID();
      await pool.query('INSERT INTO congregation (id, name) VALUES ($1, $2)', [
        congregationId,
        'Congregação Concorrente',
      ]);
      const repository = new PgIdentityRepository(pool);
      const email = new CaptureEmailService();
      const service = new IdentityService(repository, email, {
        appBaseUrl: 'https://app.example.test',
        bootstrapSecret: 'bootstrap-secret',
      });
      const master = await repository.syncExternalAccount({
        issuer: 'https://identity.example.test/',
        subject: 'master-concurrent',
        email: 'master@example.test',
        emailVerified: true,
        csrfToken: 'not-persisted',
      });
      await repository.setMaster(master.accountId, true);
      const publisher = await repository.syncExternalAccount({
        issuer: 'https://identity.example.test/',
        subject: 'publisher-concurrent',
        email: 'publisher@example.test',
        emailVerified: true,
        csrfToken: 'not-persisted',
      });
      const invite = await service.inviteMember(
        { ...master, isMaster: true },
        { congregationId, email: publisher.email, role: 'PUBLISHER' },
      );

      const results = await Promise.allSettled([
        service.acceptInvitation(publisher, invite.token),
        service.acceptInvitation(publisher, invite.token),
      ]);
      expect(
        results.filter((item) => item.status === 'fulfilled'),
      ).toHaveLength(1);
      const count = await pool.query<{ total: number }>(
        'SELECT count(*)::integer AS total FROM membership WHERE account_id = $1 AND congregation_id = $2',
        [publisher.accountId, congregationId],
      );
      expect(count.rows[0]!.total).toBe(1);
    });
  });
});
