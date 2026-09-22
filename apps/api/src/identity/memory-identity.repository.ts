import { randomUUID } from 'node:crypto';
import type {
  Account,
  AuditEvent,
  Congregation,
  IdentityRepository,
  Invitation,
  InvitationStatus,
  Membership,
  MembershipDetails,
} from './identity.repository.js';

export class MemoryIdentityRepository implements IdentityRepository {
  private readonly accountRows = new Map<string, Account>();
  private readonly congregationRows = new Map<string, Congregation>();
  private readonly membershipRows = new Map<string, Membership>();
  private readonly invitationRows = new Map<string, Invitation>();
  private readonly audits: AuditEvent[] = [];

  addAccount(account: Account): void {
    this.accountRows.set(account.accountId, structuredClone(account));
  }
  addCongregation(congregation: Congregation): void {
    this.congregationRows.set(congregation.id, structuredClone(congregation));
  }
  addMembership(membership: Membership): void {
    this.membershipRows.set(membership.id, structuredClone(membership));
  }
  setMaster(accountId: string, value: boolean): void {
    const account = this.accountRows.get(accountId);
    if (!account) throw new Error('Conta não encontrada.');
    account.isMaster = value;
  }
  hasMaster(): boolean {
    return [...this.accountRows.values()].some((item) => item.isMaster);
  }
  account(id: string): Account | undefined {
    return this.accountRows.get(id);
  }
  congregation(id: string): Congregation | undefined {
    return this.congregationRows.get(id);
  }
  congregations(): Congregation[] {
    return [...this.congregationRows.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }
  membershipById(id: string): Membership | undefined {
    return this.membershipRows.get(id);
  }
  membership(
    accountId: string,
    congregationId: string,
  ): Membership | undefined {
    return [...this.membershipRows.values()].find(
      (item) =>
        item.accountId === accountId && item.congregationId === congregationId,
    );
  }
  memberships(
    accountId: string,
  ): Array<Membership & { congregationName: string }> {
    return [...this.membershipRows.values()]
      .filter(
        (item) => item.accountId === accountId && item.status === 'ACTIVE',
      )
      .map((item) => ({
        ...item,
        congregationName:
          this.congregationRows.get(item.congregationId)?.name ?? '',
      }));
  }
  activeLocalAdminCount(congregationId: string): number {
    return [...this.membershipRows.values()].filter(
      (item) =>
        item.congregationId === congregationId &&
        item.role === 'LOCAL_ADMIN' &&
        item.status === 'ACTIVE',
    ).length;
  }
  createInvitation(
    input: Omit<Invitation, 'id' | 'status'>,
  ): Promise<Invitation> {
    for (const item of this.invitationRows.values()) {
      const sameScope =
        item.status === 'PENDING' &&
        item.kind === input.kind &&
        (input.kind === 'MASTER_BOOTSTRAP' ||
          (item.congregationId === input.congregationId &&
            item.recipientEmail === input.recipientEmail));
      if (sameScope) item.status = 'SUPERSEDED';
    }
    const invitation: Invitation = {
      ...input,
      id: randomUUID(),
      status: 'PENDING',
    };
    this.invitationRows.set(invitation.id, invitation);
    return Promise.resolve(invitation);
  }
  invitationByDigest(digest: string): Promise<Invitation | undefined> {
    return Promise.resolve(
      [...this.invitationRows.values()].find(
        (item) => item.tokenDigest === digest,
      ),
    );
  }
  invitationById(id: string): Invitation | undefined {
    return this.invitationRows.get(id);
  }
  updateInvitation(id: string, status: InvitationStatus): Promise<void> {
    const invitation = this.invitationRows.get(id);
    if (!invitation) throw new Error('Convite não encontrado.');
    invitation.status = status;
    return Promise.resolve();
  }
  acceptInvitation(invitation: Invitation, accountId: string): void {
    const current = this.invitationRows.get(invitation.id);
    if (!current || current.status !== 'PENDING')
      throw new Error('Convite indisponível.');
    if (current.kind === 'MASTER_BOOTSTRAP') {
      this.setMaster(accountId, true);
    } else {
      this.upsertMembership({
        accountId,
        congregationId: current.congregationId!,
        role: current.targetRole!,
        status: 'ACTIVE',
      });
    }
    current.status = 'ACCEPTED';
  }
  upsertMembership(input: Omit<Membership, 'id'>): Promise<Membership> {
    const existing = this.membership(input.accountId, input.congregationId);
    if (existing) {
      Object.assign(existing, input);
      return Promise.resolve(existing);
    }
    const membership = { ...input, id: randomUUID() };
    this.membershipRows.set(membership.id, membership);
    return Promise.resolve(membership);
  }
  changeMembership(
    id: string,
    patch: Partial<Pick<Membership, 'role' | 'status'>>,
  ): Promise<Membership> {
    const membership = this.membershipRows.get(id);
    if (!membership) throw new Error('Vínculo não encontrado.');
    Object.assign(membership, patch);
    return Promise.resolve(membership);
  }
  async changeMembershipWithAudit(
    id: string,
    patch: Partial<Pick<Membership, 'role' | 'status'>>,
    event: AuditEvent,
  ): Promise<Membership> {
    const membership = await this.changeMembership(id, patch);
    await this.addAudit(event);
    return membership;
  }
  congregationMemberships(congregationId: string): MembershipDetails[] {
    return [...this.membershipRows.values()]
      .filter((item) => item.congregationId === congregationId)
      .map((item) => ({
        ...item,
        email: this.accountRows.get(item.accountId)?.email ?? '',
      }))
      .sort((left, right) => left.id.localeCompare(right.id));
  }
  addAudit(event: AuditEvent): Promise<void> {
    this.audits.push(structuredClone(event));
    return Promise.resolve();
  }

  invitationTokenDigests(): string[] {
    return [...this.invitationRows.values()].map((item) => item.tokenDigest);
  }
  auditEvents(): AuditEvent[] {
    return structuredClone(this.audits);
  }
}
