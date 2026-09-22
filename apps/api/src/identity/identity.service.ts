import { createHash, randomBytes } from 'node:crypto';
import type { EmailService } from './email.service.js';
import type {
  Account,
  IdentityRepository,
  Invitation,
  LocalRole,
  MembershipStatus,
} from './identity.repository.js';

export type AuthenticatedIdentity = Account;

type IdentityOptions = {
  appBaseUrl: string;
  bootstrapSecret: string;
  now?: () => Date;
};

function digest(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
function normalized(email: string): string {
  return email.trim().toLocaleLowerCase('en-US');
}
function secretToken(): string {
  return randomBytes(32).toString('base64url');
}

export class IdentityService {
  private readonly now: () => Date;

  constructor(
    private readonly repository: IdentityRepository,
    private readonly email: EmailService,
    private readonly options: IdentityOptions,
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async issueMasterBootstrap(providedSecret: string, email: string) {
    if (providedSecret !== this.options.bootstrapSecret)
      throw new Error('Acesso negado.');
    if (await this.repository.hasMaster()) {
      throw new Error('A conta master já foi inicializada.');
    }
    const token = secretToken();
    const createdAt = this.now();
    const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);
    const invitation = await this.repository.createInvitation({
      kind: 'MASTER_BOOTSTRAP',
      congregationId: null,
      recipientEmail: normalized(email),
      tokenDigest: digest(token),
      targetRole: null,
      expiresAt,
      createdByAccountId: null,
      createdAt,
    });
    await this.repository.addAudit({
      type: 'MASTER_BOOTSTRAP_ISSUED',
      actorAccountId: null,
      invitationId: invitation.id,
    });
    await this.email.send({
      to: normalized(email),
      template: 'master-bootstrap',
      parameters: { link: `${this.options.appBaseUrl}/convites/${token}` },
    });
    return { token, expiresAt, invitationId: invitation.id };
  }

  async inviteMember(
    actor: AuthenticatedIdentity,
    input: { congregationId: string; email: string; role: LocalRole },
  ) {
    await this.assertCanInvite(actor, input.congregationId, input.role);
    const token = secretToken();
    const createdAt = this.now();
    const expiresAt = new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    const invitation = await this.repository.createInvitation({
      kind: 'MEMBERSHIP',
      congregationId: input.congregationId,
      recipientEmail: normalized(input.email),
      tokenDigest: digest(token),
      targetRole: input.role,
      expiresAt,
      createdByAccountId: actor.accountId,
      createdAt,
    });
    await this.repository.addAudit({
      type: 'MEMBERSHIP_INVITED',
      actorAccountId: actor.accountId,
      congregationId: input.congregationId,
      invitationId: invitation.id,
    });
    await this.email.send({
      to: normalized(input.email),
      template: 'membership-invitation',
      parameters: { link: `${this.options.appBaseUrl}/convites/${token}` },
    });
    return { token, expiresAt, invitationId: invitation.id };
  }

  async acceptInvitation(
    actor: AuthenticatedIdentity,
    token: string,
  ): Promise<void> {
    const invitation = await this.pendingInvitation(token);
    this.assertRecipient(actor, invitation);
    if (invitation.kind === 'MASTER_BOOTSTRAP') {
      if (await this.repository.hasMaster())
        throw new Error('Convite indisponível.');
    }
    await this.repository.acceptInvitation(
      invitation,
      actor.accountId,
      this.now(),
    );
    if (
      invitation.kind === 'MEMBERSHIP' &&
      invitation.targetRole === 'LOCAL_ADMIN'
    ) {
      const membership = await this.repository.membership(
        actor.accountId,
        invitation.congregationId!,
      );
      await this.repository.addAudit({
        type: 'LOCAL_ADMIN_GRANTED',
        actorAccountId: invitation.createdByAccountId,
        subjectAccountId: actor.accountId,
        congregationId: invitation.congregationId,
        invitationId: invitation.id,
        membershipId: membership?.id,
      });
    }
  }

  async declineInvitation(
    actor: AuthenticatedIdentity,
    token: string,
  ): Promise<void> {
    const invitation = await this.pendingInvitation(token);
    this.assertRecipient(actor, invitation);
    await this.repository.updateInvitation(
      invitation.id,
      'DECLINED',
      this.now(),
    );
  }

  async revokeInvitation(
    actor: AuthenticatedIdentity,
    invitationId: string,
  ): Promise<void> {
    const invitation = await this.repository.invitationById(invitationId);
    if (!invitation || invitation.status !== 'PENDING') {
      throw new Error('Recurso não encontrado.');
    }
    if (invitation.kind === 'MASTER_BOOTSTRAP') {
      if (!actor.isMaster) throw new Error('Acesso negado.');
    } else {
      await this.assertCanInvite(
        actor,
        invitation.congregationId!,
        invitation.targetRole!,
      );
    }
    await this.repository.updateInvitation(
      invitation.id,
      'REVOKED',
      this.now(),
    );
  }

  async listMemberships(actor: AuthenticatedIdentity, congregationId: string) {
    if (!actor.isMaster) {
      const local = await this.repository.membership(
        actor.accountId,
        congregationId,
      );
      if (!local || local.status !== 'ACTIVE' || local.role !== 'LOCAL_ADMIN') {
        throw new Error('Recurso não encontrado.');
      }
    }
    if (!(await this.repository.congregation(congregationId))) {
      throw new Error('Recurso não encontrado.');
    }
    return this.repository.congregationMemberships(congregationId);
  }

  async changeMembershipStatus(
    actor: AuthenticatedIdentity,
    membershipId: string,
    status: MembershipStatus,
  ): Promise<void> {
    const membership = await this.repository.membershipById(membershipId);
    if (!membership) throw new Error('Recurso não encontrado.');
    const local = await this.repository.membership(
      actor.accountId,
      membership.congregationId,
    );
    if (
      !actor.isMaster &&
      (!local || local.status !== 'ACTIVE' || local.role !== 'LOCAL_ADMIN')
    ) {
      throw new Error('Recurso não encontrado.');
    }
    if (!actor.isMaster && membership.role !== 'PUBLISHER')
      throw new Error('Acesso negado.');
    if (
      status === 'REVOKED' &&
      membership.role === 'LOCAL_ADMIN' &&
      (await this.repository.activeLocalAdminCount(
        membership.congregationId,
      )) <= 1
    ) {
      throw new Error(
        'Defina outro administrador local antes de remover o último.',
      );
    }
    const subject = await this.repository.account(membership.accountId);
    await this.repository.changeMembershipWithAudit(
      membership.id,
      { status },
      {
        type:
          status === 'ACTIVE' ? 'MEMBERSHIP_REACTIVATED' : 'MEMBERSHIP_REVOKED',
        actorAccountId: actor.accountId,
        subjectAccountId: membership.accountId,
        congregationId: membership.congregationId,
        membershipId: membership.id,
      },
    );
    if (subject) {
      try {
        await this.email.send({
          to: subject.email,
          template:
            status === 'ACTIVE'
              ? 'membership-reactivated'
              : 'membership-revoked',
          parameters: { congregationId: membership.congregationId },
        });
      } catch {
        // A alteração de acesso não pode ser revertida por falha de notificação.
      }
    }
  }

  async changeMembershipRole(
    actor: AuthenticatedIdentity,
    membershipId: string,
    role: LocalRole,
  ): Promise<void> {
    if (!actor.isMaster) throw new Error('Acesso negado.');
    const membership = await this.repository.membershipById(membershipId);
    if (!membership) throw new Error('Recurso não encontrado.');
    if (
      membership.role === 'LOCAL_ADMIN' &&
      role !== 'LOCAL_ADMIN' &&
      membership.status === 'ACTIVE' &&
      (await this.repository.activeLocalAdminCount(
        membership.congregationId,
      )) <= 1
    ) {
      throw new Error(
        'Defina outro administrador local antes de remover o último.',
      );
    }
    await this.repository.changeMembershipWithAudit(
      membershipId,
      { role },
      {
        type:
          role === 'LOCAL_ADMIN'
            ? 'LOCAL_ADMIN_GRANTED'
            : 'LOCAL_ADMIN_REVOKED',
        actorAccountId: actor.accountId,
        subjectAccountId: membership.accountId,
        congregationId: membership.congregationId,
        membershipId,
      },
    );
  }

  async sessionFor(account: AuthenticatedIdentity) {
    return {
      authenticated: true as const,
      email: account.email,
      emailVerified: account.emailVerified,
      isMaster: account.isMaster,
      memberships: await this.repository.memberships(account.accountId),
      adminCongregations: account.isMaster
        ? await this.repository.congregations()
        : [],
    };
  }

  private async assertCanInvite(
    actor: AuthenticatedIdentity,
    congregationId: string,
    role: LocalRole,
  ): Promise<void> {
    if (!(await this.repository.congregation(congregationId))) {
      throw new Error('Recurso não encontrado.');
    }
    if (actor.isMaster) return;
    const membership = await this.repository.membership(
      actor.accountId,
      congregationId,
    );
    if (
      !membership ||
      membership.status !== 'ACTIVE' ||
      membership.role !== 'LOCAL_ADMIN'
    ) {
      throw new Error('Recurso não encontrado.');
    }
    if (role !== 'PUBLISHER') throw new Error('Acesso negado.');
  }

  private async pendingInvitation(token: string): Promise<Invitation> {
    const invitation = await this.repository.invitationByDigest(digest(token));
    if (!invitation || invitation.status !== 'PENDING') {
      throw new Error('Convite indisponível.');
    }
    if (invitation.expiresAt.getTime() <= this.now().getTime()) {
      await this.repository.updateInvitation(
        invitation.id,
        'EXPIRED',
        this.now(),
      );
      throw new Error('Convite expirado.');
    }
    return invitation;
  }

  private assertRecipient(
    actor: AuthenticatedIdentity,
    invitation: Invitation,
  ): void {
    if (!actor.emailVerified)
      throw new Error('Confirme seu e-mail antes de continuar.');
    if (normalized(actor.email) !== invitation.recipientEmail) {
      throw new Error('Este convite pertence a outra pessoa.');
    }
  }
}
