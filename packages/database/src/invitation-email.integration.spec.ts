import { randomUUID } from 'node:crypto';
import { CaptureEmailService } from '../../../apps/api/src/identity/email.service.js';
import { InvitationEmailService } from '../../../apps/api/src/identity/invitation-email.service.js';
import { ResendInvitationTransport } from '../../../apps/api/src/identity/invitation-email.transport.js';
import { IdentityService } from '../../../apps/api/src/identity/identity.service.js';
import { PgIdentityRepository } from '../../../apps/api/src/identity/pg-identity.repository.js';
import { runPrisma, withDisposableDatabase } from './test-support/database.js';

describe('access invitation Resend delivery', () => {
  it('persists invitation delivery, retries an uncertain acceptance idempotently, preserves capture and invalidates replaced or expired invitations', async () => {
    await withDisposableDatabase(async (url, pool) => {
      expect(runPrisma(url, ['migrate', 'deploy'])).toBe(0);
      let now = new Date('2026-10-19T12:00:00Z');
      const repository = new PgIdentityRepository(pool);
      const capture = new CaptureEmailService();
      const service = new IdentityService(repository, capture, {
        appBaseUrl: 'https://app.example.test',
        bootstrapSecret: 'bootstrap-secret',
        queueOnly: true,
        now: () => now,
      });
      const congregationId = randomUUID();
      await pool.query('INSERT INTO congregation (id,name) VALUES ($1,$2)', [
        congregationId,
        'Congregação de envio',
      ]);
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
      await pool.query(
        `INSERT INTO membership (id,account_id,congregation_id,role,status)
         VALUES ($1,$2,$3,'LOCAL_ADMIN','ACTIVE')`,
        [randomUUID(), local.accountId, congregationId],
      );

      const first = await service.inviteMember(local, {
        congregationId,
        email: publisher.email,
        role: 'PUBLISHER',
      });
      const mail = async (id: string) =>
        (
          await pool.query(
            'SELECT * FROM access_invitation_mail WHERE invitation_id=$1',
            [id],
          )
        ).rows[0];
      expect(await mail(first.invitationId)).toMatchObject({
        mail_state: 'pending',
        mail_attempts: 0,
      });

      const providerId = randomUUID();
      const accepted = new Map<string, string>();
      const payloads: string[] = [];
      let loseResponse = true;
      const provider = vi.fn<typeof fetch>(async (_input, options) => {
        const key = (options?.headers as Record<string, string>)[
          'idempotency-key'
        ]!;
        payloads.push(String(options?.body));
        if (!accepted.has(key)) accepted.set(key, providerId);
        if (loseResponse) {
          loseResponse = false;
          throw new Error('Simulated lost response after provider acceptance');
        }
        return new Response(JSON.stringify({ id: accepted.get(key) }));
      });
      const resend = new InvitationEmailService(
        pool,
        new ResendInvitationTransport(
          'fake-provider-key',
          'invites@example.test',
          provider,
        ),
        () => now,
      );
      await resend.deliver(1);
      expect(await mail(first.invitationId)).toMatchObject({
        mail_state: 'failed',
        mail_attempts: 1,
        provider_id: null,
      });
      now = new Date(now.getTime() + 31_000);
      await Promise.all([resend.deliver(1), resend.deliver(1)]);
      expect(provider).toHaveBeenCalledTimes(2);
      expect(accepted.size).toBe(1);
      expect(payloads[0]).toBe(payloads[1]);
      expect(
        (provider.mock.calls[0]?.[1]?.headers as Record<string, string>)[
          'idempotency-key'
        ],
      ).toBe(`access-invitation/${first.invitationId}`);
      expect(await mail(first.invitationId)).toMatchObject({
        mail_state: 'sent',
        mail_attempts: 2,
        provider_id: providerId,
        next_attempt_at: null,
      });

      const replacement = await service.inviteMember(local, {
        congregationId,
        email: publisher.email,
        role: 'PUBLISHER',
      });
      await expect(
        service.acceptInvitation(publisher, first.token),
      ).rejects.toThrow('Convite indisponível.');
      expect(
        await pool.query('SELECT status FROM access_invitation WHERE id=$1', [
          first.invitationId,
        ]),
      ).toMatchObject({ rows: [{ status: 'SUPERSEDED' }] });

      const captured = new InvitationEmailService(pool, capture, () => now);
      await captured.deliver(1);
      expect(await mail(replacement.invitationId)).toMatchObject({
        mail_state: 'captured',
        mail_transport: 'capture',
      });
      expect(capture.messages).toHaveLength(1);

      now = new Date(now.getTime() + 7 * 24 * 60 * 60_000);
      await expect(
        service.acceptInvitation(publisher, replacement.token),
      ).rejects.toThrow('Convite expirado.');
    });
  }, 120_000);
});
