import { createHash, randomBytes } from 'node:crypto';

export type SessionIdentity = {
  issuer: string;
  subject: string;
  email: string;
  emailVerified: boolean;
  csrfToken: string;
  activeCongregationId?: string;
};

type StoredSession = SessionIdentity & { expiresAt: Date };

function opaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

export class MemorySessionStore {
  private readonly sessions = new Map<string, StoredSession>();

  constructor(
    private readonly now: () => Date = () => new Date(),
    private readonly lifetimeMs = 12 * 60 * 60 * 1000,
  ) {}

  create(identity: Omit<SessionIdentity, 'csrfToken'>): {
    token: string;
    identity: SessionIdentity;
  } {
    const token = opaqueToken();
    const stored: StoredSession = {
      ...identity,
      csrfToken: opaqueToken(),
      expiresAt: new Date(this.now().getTime() + this.lifetimeMs),
    };
    this.sessions.set(digest(token), stored);
    return { token, identity: stored };
  }

  get(token: string): SessionIdentity | null {
    const key = digest(token);
    const stored = this.sessions.get(key);
    if (!stored) return null;
    if (stored.expiresAt.getTime() <= this.now().getTime()) {
      this.sessions.delete(key);
      return null;
    }
    const { expiresAt: _expiresAt, ...identity } = stored;
    return identity;
  }

  revoke(token: string): void {
    this.sessions.delete(digest(token));
  }

  setActiveCongregation(token: string, congregationId: string): boolean {
    const stored = this.sessions.get(digest(token));
    if (!stored || stored.expiresAt.getTime() <= this.now().getTime())
      return false;
    stored.activeCongregationId = congregationId;
    return true;
  }
}
