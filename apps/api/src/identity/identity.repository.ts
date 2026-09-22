export type LocalRole = 'PUBLISHER' | 'LOCAL_ADMIN';
export type MembershipStatus = 'ACTIVE' | 'REVOKED';
export type InvitationKind = 'MEMBERSHIP' | 'MASTER_BOOTSTRAP';
export type InvitationStatus =
  'PENDING' | 'ACCEPTED' | 'DECLINED' | 'REVOKED' | 'EXPIRED' | 'SUPERSEDED';

export type Account = {
  accountId: string;
  email: string;
  emailVerified: boolean;
  isMaster: boolean;
  issuer?: string;
  subject?: string;
};
export type Congregation = { id: string; name: string };
export type Membership = {
  id: string;
  accountId: string;
  congregationId: string;
  role: LocalRole;
  status: MembershipStatus;
};
export type MembershipDetails = Membership & { email: string };
export type Invitation = {
  id: string;
  kind: InvitationKind;
  congregationId: string | null;
  recipientEmail: string;
  tokenDigest: string;
  targetRole: LocalRole | null;
  status: InvitationStatus;
  expiresAt: Date;
  createdByAccountId: string | null;
};
export type AuditEvent = {
  type:
    | 'MEMBERSHIP_INVITED'
    | 'MEMBERSHIP_REVOKED'
    | 'MEMBERSHIP_REACTIVATED'
    | 'LOCAL_ADMIN_GRANTED'
    | 'LOCAL_ADMIN_REVOKED'
    | 'MASTER_BOOTSTRAP_ISSUED';
  actorAccountId: string | null;
  subjectAccountId?: string | null;
  congregationId?: string | null;
  invitationId?: string | null;
  membershipId?: string | null;
};

export interface IdentityRepository {
  hasMaster(): Promise<boolean> | boolean;
  account(id: string): Promise<Account | undefined> | Account | undefined;
  setMaster(accountId: string, value: boolean): Promise<void> | void;
  congregation(
    id: string,
  ): Promise<Congregation | undefined> | Congregation | undefined;
  congregations(): Promise<Congregation[]> | Congregation[];
  membershipById(
    id: string,
  ): Promise<Membership | undefined> | Membership | undefined;
  membership(
    accountId: string,
    congregationId: string,
  ): Promise<Membership | undefined> | Membership | undefined;
  memberships(
    accountId: string,
  ):
    | Promise<Array<Membership & { congregationName: string }>>
    | Array<Membership & { congregationName: string }>;
  activeLocalAdminCount(congregationId: string): Promise<number> | number;
  createInvitation(
    input: Omit<Invitation, 'id' | 'status'>,
  ): Promise<Invitation>;
  invitationByDigest(digest: string): Promise<Invitation | undefined>;
  invitationById(
    id: string,
  ): Promise<Invitation | undefined> | Invitation | undefined;
  updateInvitation(
    id: string,
    status: InvitationStatus,
    at: Date,
  ): Promise<void>;
  acceptInvitation(
    invitation: Invitation,
    accountId: string,
    at: Date,
  ): Promise<void> | void;
  upsertMembership(input: Omit<Membership, 'id'>): Promise<Membership>;
  changeMembership(
    id: string,
    patch: Partial<Pick<Membership, 'role' | 'status'>>,
  ): Promise<Membership>;
  changeMembershipWithAudit(
    id: string,
    patch: Partial<Pick<Membership, 'role' | 'status'>>,
    event: AuditEvent,
  ): Promise<Membership>;
  congregationMemberships(
    congregationId: string,
  ): Promise<MembershipDetails[]> | MembershipDetails[];
  addAudit(event: AuditEvent): Promise<void>;
}
