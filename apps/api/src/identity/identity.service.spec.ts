import { CaptureEmailService } from './email.service.js';
import {
  IdentityService,
  type AuthenticatedIdentity,
} from './identity.service.js';
import { MemoryIdentityRepository } from './memory-identity.repository.js';

const master: AuthenticatedIdentity = {
  accountId: 'master',
  email: 'master@example.test',
  emailVerified: true,
  isMaster: true,
};
const local: AuthenticatedIdentity = {
  accountId: 'local-a',
  email: 'local@example.test',
  emailVerified: true,
  isMaster: false,
};
const publisher: AuthenticatedIdentity = {
  accountId: 'publisher',
  email: 'publisher@example.test',
  emailVerified: true,
  isMaster: false,
};

function fixture() {
  let now = new Date('2026-09-21T12:00:00Z');
  const repository = new MemoryIdentityRepository();
  repository.addCongregation({ id: 'cong-a', name: 'Congregação A' });
  repository.addCongregation({ id: 'cong-b', name: 'Congregação B' });
  repository.addCongregation({ id: 'cong-c', name: 'Congregação C' });
  repository.addAccount(master);
  repository.addAccount(local);
  repository.addAccount(publisher);
  repository.addMembership({
    id: 'local-membership',
    accountId: local.accountId,
    congregationId: 'cong-a',
    role: 'LOCAL_ADMIN',
    status: 'ACTIVE',
  });
  const email = new CaptureEmailService();
  const service = new IdentityService(repository, email, {
    appBaseUrl: 'https://app.example.test',
    bootstrapSecret: 'bootstrap-secret',
    now: () => now,
  });
  return {
    repository,
    email,
    service,
    get now() {
      return now;
    },
    advance(milliseconds: number) {
      now = new Date(now.getTime() + milliseconds);
    },
  };
}

describe('IDN-001C invitations and tenant authorization', () => {
  it('issues one 24-hour bootstrap invitation and accepts it only once', async () => {
    const { repository, email, service, now } = fixture();
    repository.setMaster('master', false);

    const issued = await service.issueMasterBootstrap(
      'bootstrap-secret',
      'master@example.test',
    );
    expect(issued.expiresAt).toEqual(
      new Date(now.getTime() + 24 * 60 * 60 * 1000),
    );
    expect(repository.invitationTokenDigests()).not.toContain(issued.token);
    expect(email.messages).toHaveLength(1);

    await service.acceptInvitation(master, issued.token);
    expect(repository.account('master')?.isMaster).toBe(true);
    await expect(
      service.acceptInvitation(master, issued.token),
    ).rejects.toThrow('Convite indisponível.');
    await expect(
      service.issueMasterBootstrap('bootstrap-secret', 'another@example.test'),
    ).rejects.toThrow('A conta master já foi inicializada.');
  });

  it('rejects a non-fictional recipient before persisting an invitation', async () => {
    const { repository, service } = fixture();

    await expect(
      service.inviteMember(local, {
        congregationId: 'cong-a',
        email: 'person@real-domain.test.br',
        role: 'PUBLISHER',
      }),
    ).rejects.toThrow('A captura aceita somente endereços fictícios.');
    expect(repository.invitationTokenDigests()).toEqual([]);
  });

  it('lets master invite a local admin and local admin invite only publishers', async () => {
    const { repository, service } = fixture();
    const adminInvite = await service.inviteMember(master, {
      congregationId: 'cong-b',
      email: 'local@example.test',
      role: 'LOCAL_ADMIN',
    });
    await service.acceptInvitation(local, adminInvite.token);
    expect(repository.membership('local-a', 'cong-b')).toMatchObject({
      role: 'LOCAL_ADMIN',
      status: 'ACTIVE',
    });

    const publisherInvite = await service.inviteMember(local, {
      congregationId: 'cong-a',
      email: 'publisher@example.test',
      role: 'PUBLISHER',
    });
    await service.acceptInvitation(publisher, publisherInvite.token);
    expect(repository.membership('publisher', 'cong-a')).toMatchObject({
      role: 'PUBLISHER',
    });
    await expect(
      service.inviteMember(local, {
        congregationId: 'cong-a',
        email: 'other@example.test',
        role: 'LOCAL_ADMIN',
      }),
    ).rejects.toThrow('Acesso negado.');
    await expect(
      service.inviteMember(local, {
        congregationId: 'cong-c',
        email: 'other@example.test',
        role: 'PUBLISHER',
      }),
    ).rejects.toThrow('Recurso não encontrado.');
  });

  it('supersedes resend tokens and requires the verified recipient', async () => {
    const { service } = fixture();
    const first = await service.inviteMember(local, {
      congregationId: 'cong-a',
      email: 'publisher@example.test',
      role: 'PUBLISHER',
    });
    const second = await service.inviteMember(local, {
      congregationId: 'cong-a',
      email: 'PUBLISHER@example.test',
      role: 'PUBLISHER',
    });
    await expect(
      service.acceptInvitation(publisher, first.token),
    ).rejects.toThrow('Convite indisponível.');
    await expect(
      service.acceptInvitation(
        { ...publisher, email: 'other@example.test' },
        second.token,
      ),
    ).rejects.toThrow('Este convite pertence a outra pessoa.');
    await expect(
      service.acceptInvitation(
        { ...publisher, emailVerified: false },
        second.token,
      ),
    ).rejects.toThrow('Confirme seu e-mail antes de continuar.');
    await service.acceptInvitation(publisher, second.token);
  });

  it('expires at seven days and lets the local administrator revoke a pending invitation', async () => {
    const first = fixture();
    const expiring = await first.service.inviteMember(local, {
      congregationId: 'cong-a',
      email: 'publisher@example.test',
      role: 'PUBLISHER',
    });
    first.advance(7 * 24 * 60 * 60 * 1000);
    await expect(
      first.service.acceptInvitation(publisher, expiring.token),
    ).rejects.toThrow('Convite expirado.');

    const second = fixture();
    const revoked = await second.service.inviteMember(local, {
      congregationId: 'cong-a',
      email: 'publisher@example.test',
      role: 'PUBLISHER',
    });
    await second.service.revokeInvitation(local, revoked.invitationId);
    await expect(
      second.service.acceptInvitation(publisher, revoked.token),
    ).rejects.toThrow('Convite indisponível.');
  });

  it('lists memberships only for an authorized congregation', async () => {
    const { repository, service } = fixture();
    repository.addMembership({
      id: 'publisher-a',
      accountId: publisher.accountId,
      congregationId: 'cong-a',
      role: 'PUBLISHER',
      status: 'ACTIVE',
    });
    expect(await service.listMemberships(local, 'cong-a')).toEqual([
      expect.objectContaining({ id: 'local-membership', role: 'LOCAL_ADMIN' }),
      expect.objectContaining({ id: 'publisher-a', role: 'PUBLISHER' }),
    ]);
    await expect(service.listMemberships(local, 'cong-b')).rejects.toThrow(
      'Recurso não encontrado.',
    );
  });

  it('revokes and reactivates only a publisher in the local congregation', async () => {
    const { repository, email, service } = fixture();
    repository.addMembership({
      id: 'publisher-a',
      accountId: publisher.accountId,
      congregationId: 'cong-a',
      role: 'PUBLISHER',
      status: 'ACTIVE',
    });
    repository.addMembership({
      id: 'publisher-b',
      accountId: publisher.accountId,
      congregationId: 'cong-b',
      role: 'PUBLISHER',
      status: 'ACTIVE',
    });

    await service.changeMembershipStatus(local, 'publisher-a', 'REVOKED');
    expect(repository.membershipById('publisher-a')?.status).toBe('REVOKED');
    expect(email.messages.at(-1)?.template).toBe('membership-revoked');
    await service.changeMembershipStatus(local, 'publisher-a', 'ACTIVE');
    expect(repository.membershipById('publisher-a')?.status).toBe('ACTIVE');
    await expect(
      service.changeMembershipStatus(local, 'publisher-b', 'REVOKED'),
    ).rejects.toThrow('Recurso não encontrado.');
    expect(repository.auditEvents()).toHaveLength(2);
  });

  it('prevents removing the last active local admin and keeps roles tenant-scoped', async () => {
    const { repository, service } = fixture();
    repository.addMembership({
      id: 'master-publisher',
      accountId: master.accountId,
      congregationId: 'cong-b',
      role: 'PUBLISHER',
      status: 'ACTIVE',
    });
    await expect(
      service.changeMembershipRole(master, 'local-membership', 'PUBLISHER'),
    ).rejects.toThrow(
      'Defina outro administrador local antes de remover o último.',
    );
    expect(repository.membership('master', 'cong-b')?.role).toBe('PUBLISHER');
    expect(repository.membership('local-a', 'cong-a')?.role).toBe(
      'LOCAL_ADMIN',
    );
  });
});
