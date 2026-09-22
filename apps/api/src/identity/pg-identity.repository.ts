import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import type { SessionIdentity } from '../auth/session.store.js';
import type {
  Account,
  AuditEvent,
  Congregation,
  IdentityRepository,
  Invitation,
  InvitationStatus,
  LocalRole,
  Membership,
  MembershipDetails,
} from './identity.repository.js';

type AccountRow = QueryResultRow & {
  id: string;
  email: string;
  email_verified: boolean;
  is_master: boolean;
  provider_issuer: string;
  provider_subject: string;
};
type MembershipRow = QueryResultRow & {
  id: string;
  account_id: string;
  congregation_id: string;
  role: LocalRole;
  status: 'ACTIVE' | 'REVOKED';
  congregation_name?: string;
  email?: string;
};
type InvitationRow = QueryResultRow & {
  id: string;
  kind: 'MEMBERSHIP' | 'MASTER_BOOTSTRAP';
  congregation_id: string | null;
  recipient_email_normalized: string;
  token_digest: Buffer;
  target_role: LocalRole | null;
  status: InvitationStatus;
  expires_at: Date;
  created_by_account_id: string | null;
};

function account(row: AccountRow): Account {
  return {
    accountId: row.id,
    email: row.email,
    emailVerified: row.email_verified,
    isMaster: row.is_master,
    issuer: row.provider_issuer,
    subject: row.provider_subject,
  };
}
function membership(row: MembershipRow): Membership {
  return {
    id: row.id,
    accountId: row.account_id,
    congregationId: row.congregation_id,
    role: row.role,
    status: row.status,
  };
}
function invitation(row: InvitationRow): Invitation {
  return {
    id: row.id,
    kind: row.kind,
    congregationId: row.congregation_id,
    recipientEmail: row.recipient_email_normalized,
    tokenDigest: row.token_digest.toString('hex'),
    targetRole: row.target_role,
    status: row.status,
    expiresAt: row.expires_at,
    createdByAccountId: row.created_by_account_id,
  };
}

export class PgIdentityRepository implements IdentityRepository {
  constructor(private readonly pool: Pool) {}

  async syncExternalAccount(identity: SessionIdentity): Promise<Account> {
    const result = await this.pool.query<AccountRow>(
      `INSERT INTO identity_account
         (id, provider_issuer, provider_subject, email, email_verified)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (provider_issuer, provider_subject) DO UPDATE
       SET email = EXCLUDED.email,
           email_verified = EXCLUDED.email_verified,
           updated_at = now()
       RETURNING *`,
      [
        randomUUID(),
        identity.issuer,
        identity.subject,
        identity.email,
        identity.emailVerified,
      ],
    );
    return account(result.rows[0]!);
  }

  async hasMaster(): Promise<boolean> {
    const result = await this.pool.query<{ found: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM identity_account WHERE is_master) AS found',
    );
    return result.rows[0]!.found;
  }
  async account(id: string): Promise<Account | undefined> {
    const result = await this.pool.query<AccountRow>(
      'SELECT * FROM identity_account WHERE id = $1',
      [id],
    );
    return result.rows[0] ? account(result.rows[0]) : undefined;
  }
  async setMaster(accountId: string, value: boolean): Promise<void> {
    await this.pool.query(
      'UPDATE identity_account SET is_master = $2, updated_at = now() WHERE id = $1',
      [accountId, value],
    );
  }
  async congregation(id: string): Promise<Congregation | undefined> {
    const result = await this.pool.query<{ id: string; name: string }>(
      'SELECT id, name FROM congregation WHERE id = $1',
      [id],
    );
    return result.rows[0];
  }
  async congregations(): Promise<Congregation[]> {
    const result = await this.pool.query<{ id: string; name: string }>(
      'SELECT id, name FROM congregation ORDER BY name',
    );
    return result.rows;
  }
  async membershipById(id: string): Promise<Membership | undefined> {
    const result = await this.pool.query<MembershipRow>(
      'SELECT * FROM membership WHERE id = $1',
      [id],
    );
    return result.rows[0] ? membership(result.rows[0]) : undefined;
  }
  async membership(
    accountId: string,
    congregationId: string,
  ): Promise<Membership | undefined> {
    const result = await this.pool.query<MembershipRow>(
      'SELECT * FROM membership WHERE account_id = $1 AND congregation_id = $2',
      [accountId, congregationId],
    );
    return result.rows[0] ? membership(result.rows[0]) : undefined;
  }
  async memberships(
    accountId: string,
  ): Promise<Array<Membership & { congregationName: string }>> {
    const result = await this.pool.query<MembershipRow>(
      `SELECT m.*, c.name AS congregation_name
       FROM membership m JOIN congregation c ON c.id = m.congregation_id
       WHERE m.account_id = $1 AND m.status = 'ACTIVE'
       ORDER BY c.name`,
      [accountId],
    );
    return result.rows.map((row) => ({
      ...membership(row),
      congregationName: row.congregation_name!,
    }));
  }
  async activeLocalAdminCount(congregationId: string): Promise<number> {
    const result = await this.pool.query<{ total: number }>(
      `SELECT count(*)::integer AS total FROM membership
       WHERE congregation_id = $1 AND role = 'LOCAL_ADMIN' AND status = 'ACTIVE'`,
      [congregationId],
    );
    return result.rows[0]!.total;
  }

  async createInvitation(
    input: Omit<Invitation, 'id' | 'status'> & { createdAt: Date },
  ): Promise<Invitation> {
    return this.transaction(async (client) => {
      if (input.kind === 'MASTER_BOOTSTRAP') {
        await client.query(
          `UPDATE access_invitation SET status = 'SUPERSEDED', invalidated_at = now()
           WHERE kind = 'MASTER_BOOTSTRAP' AND status = 'PENDING'`,
        );
      } else {
        await client.query(
          `UPDATE access_invitation SET status = 'SUPERSEDED', invalidated_at = now()
           WHERE kind = 'MEMBERSHIP' AND status = 'PENDING'
             AND congregation_id = $1 AND recipient_email_normalized = $2`,
          [input.congregationId, input.recipientEmail],
        );
      }
      const result = await client.query<InvitationRow>(
        `INSERT INTO access_invitation
           (id, kind, congregation_id, recipient_email, recipient_email_normalized,
            token_digest, target_role, expires_at, created_by_account_id, created_at)
         VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          randomUUID(),
          input.kind,
          input.congregationId,
          input.recipientEmail,
          Buffer.from(input.tokenDigest, 'hex'),
          input.targetRole,
          input.expiresAt,
          input.createdByAccountId,
          input.createdAt,
        ],
      );
      return invitation(result.rows[0]!);
    });
  }
  async invitationByDigest(digest: string): Promise<Invitation | undefined> {
    const result = await this.pool.query<InvitationRow>(
      'SELECT * FROM access_invitation WHERE token_digest = $1',
      [Buffer.from(digest, 'hex')],
    );
    return result.rows[0] ? invitation(result.rows[0]) : undefined;
  }
  async invitationById(id: string): Promise<Invitation | undefined> {
    const result = await this.pool.query<InvitationRow>(
      'SELECT * FROM access_invitation WHERE id = $1',
      [id],
    );
    return result.rows[0] ? invitation(result.rows[0]) : undefined;
  }
  async updateInvitation(
    id: string,
    status: InvitationStatus,
    at: Date,
  ): Promise<void> {
    const completed = status === 'ACCEPTED' || status === 'DECLINED';
    await this.pool.query(
      `UPDATE access_invitation SET status = $2,
         completed_at = CASE WHEN $3 THEN $4 ELSE NULL END,
         invalidated_at = CASE WHEN $3 THEN NULL ELSE $4 END
       WHERE id = $1`,
      [id, status, completed, at],
    );
  }
  async acceptInvitation(
    expected: Invitation,
    accountId: string,
    at: Date,
  ): Promise<void> {
    await this.transaction(async (client) => {
      const locked = await client.query<InvitationRow>(
        'SELECT * FROM access_invitation WHERE id = $1 FOR UPDATE',
        [expected.id],
      );
      const current = locked.rows[0];
      if (
        !current ||
        current.status !== 'PENDING' ||
        current.expires_at.getTime() <= at.getTime()
      ) {
        throw new Error('Convite indisponível.');
      }
      if (current.kind === 'MASTER_BOOTSTRAP') {
        const master = await client.query<{ found: boolean }>(
          'SELECT EXISTS (SELECT 1 FROM identity_account WHERE is_master) AS found',
        );
        if (master.rows[0]!.found) throw new Error('Convite indisponível.');
        await client.query(
          'UPDATE identity_account SET is_master = true, updated_at = now() WHERE id = $1',
          [accountId],
        );
      } else {
        await client.query(
          `INSERT INTO membership
             (id, account_id, congregation_id, role, status, revoked_at)
           VALUES ($1, $2, $3, $4, 'ACTIVE', NULL)
           ON CONFLICT (account_id, congregation_id) DO UPDATE
           SET role = EXCLUDED.role, status = 'ACTIVE', revoked_at = NULL`,
          [
            randomUUID(),
            accountId,
            current.congregation_id,
            current.target_role,
          ],
        );
      }
      await client.query(
        `UPDATE access_invitation SET status = 'ACCEPTED', completed_at = $2
         WHERE id = $1`,
        [current.id, at],
      );
    });
  }
  async upsertMembership(input: Omit<Membership, 'id'>): Promise<Membership> {
    const result = await this.pool.query<MembershipRow>(
      `INSERT INTO membership (id, account_id, congregation_id, role, status, revoked_at)
       VALUES ($1, $2, $3, $4, $5, CASE WHEN $5 = 'REVOKED' THEN now() ELSE NULL END)
       ON CONFLICT (account_id, congregation_id) DO UPDATE
       SET role = EXCLUDED.role, status = EXCLUDED.status, revoked_at = EXCLUDED.revoked_at
       RETURNING *`,
      [
        randomUUID(),
        input.accountId,
        input.congregationId,
        input.role,
        input.status,
      ],
    );
    return membership(result.rows[0]!);
  }
  async changeMembership(
    id: string,
    patch: Partial<Pick<Membership, 'role' | 'status'>>,
  ): Promise<Membership> {
    const result = await this.pool.query<MembershipRow>(
      `UPDATE membership SET
         role = COALESCE($2, role),
         status = COALESCE($3, status),
         revoked_at = CASE WHEN COALESCE($3, status) = 'REVOKED' THEN COALESCE(revoked_at, now()) ELSE NULL END
       WHERE id = $1 RETURNING *`,
      [id, patch.role ?? null, patch.status ?? null],
    );
    if (!result.rows[0]) throw new Error('Recurso não encontrado.');
    return membership(result.rows[0]);
  }
  async changeMembershipWithAudit(
    id: string,
    patch: Partial<Pick<Membership, 'role' | 'status'>>,
    event: AuditEvent,
  ): Promise<Membership> {
    return this.transaction(async (client) => {
      const result = await client.query<MembershipRow>(
        `UPDATE membership SET
           role = COALESCE($2, role),
           status = COALESCE($3, status),
           revoked_at = CASE WHEN COALESCE($3, status) = 'REVOKED'
             THEN COALESCE(revoked_at, now()) ELSE NULL END
         WHERE id = $1 RETURNING *`,
        [id, patch.role ?? null, patch.status ?? null],
      );
      if (!result.rows[0]) throw new Error('Recurso não encontrado.');
      await client.query(
        `INSERT INTO identity_audit_event
           (id, event_type, outcome, actor_account_id, subject_account_id,
            congregation_id, invitation_id, membership_id)
         VALUES ($1, $2, 'SUCCEEDED', $3, $4, $5, $6, $7)`,
        [
          randomUUID(),
          event.type,
          event.actorAccountId,
          event.subjectAccountId ?? null,
          event.congregationId ?? null,
          event.invitationId ?? null,
          event.membershipId ?? null,
        ],
      );
      return membership(result.rows[0]);
    });
  }
  async congregationMemberships(
    congregationId: string,
  ): Promise<MembershipDetails[]> {
    const result = await this.pool.query<MembershipRow>(
      `SELECT m.*, a.email
       FROM membership m JOIN identity_account a ON a.id = m.account_id
       WHERE m.congregation_id = $1 ORDER BY m.created_at, m.id`,
      [congregationId],
    );
    return result.rows.map((row) => ({
      ...membership(row),
      email: row.email!,
    }));
  }
  async addAudit(event: AuditEvent): Promise<void> {
    await this.pool.query(
      `INSERT INTO identity_audit_event
         (id, event_type, outcome, actor_account_id, subject_account_id,
          congregation_id, invitation_id, membership_id)
       VALUES ($1, $2, 'SUCCEEDED', $3, $4, $5, $6, $7)`,
      [
        randomUUID(),
        event.type,
        event.actorAccountId,
        event.subjectAccountId ?? null,
        event.congregationId ?? null,
        event.invitationId ?? null,
        event.membershipId ?? null,
      ],
    );
  }

  private async transaction<T>(
    fn: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const value = await fn(client);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
