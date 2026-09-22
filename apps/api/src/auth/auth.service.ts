import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { MemorySessionStore, type SessionIdentity } from './session.store.js';

export type OidcIdentity = Omit<SessionIdentity, 'csrfToken'> & {
  nonce: string;
};

export type OidcClient = {
  authorizationUrl(input: {
    state: string;
    nonce: string;
    codeChallenge: string;
  }): string;
  exchangeCode(input: {
    code: string;
    codeVerifier: string;
    expectedNonce: string;
  }): Promise<OidcIdentity>;
  logoutUrl(): string;
};

export type AuthConfig = {
  issuer: string;
  clientId: string;
  audience: string;
  callbackUrl: string;
  logoutUrl: string;
  sessionSecret: string;
  secureCookies: boolean;
};

type LoginFlow = {
  state: string;
  nonce: string;
  codeVerifier: string;
  expiresAt: number;
};

function token(): string {
  return randomBytes(32).toString('base64url');
}

function equal(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export class AuthService {
  private readonly flows = new Map<string, LoginFlow>();

  constructor(
    private readonly config: AuthConfig,
    private readonly oidc: OidcClient,
    private readonly sessions: MemorySessionStore,
    private readonly now: () => Date = () => new Date(),
  ) {
    if (config.sessionSecret.length < 32) {
      throw new Error('SESSION_SECRET must contain at least 32 characters.');
    }
  }

  async beginLogin(): Promise<{ redirectUrl: string; flowCookie: string }> {
    for (const [id, flow] of this.flows) {
      if (flow.expiresAt <= this.now().getTime()) this.flows.delete(id);
    }
    const id = token();
    const state = token();
    const nonce = token();
    const codeVerifier = token();
    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    this.flows.set(id, {
      state,
      nonce,
      codeVerifier,
      expiresAt: this.now().getTime() + 10 * 60 * 1000,
    });
    return {
      redirectUrl: this.oidc.authorizationUrl({ state, nonce, codeChallenge }),
      flowCookie: this.sign(id),
    };
  }

  async completeLogin(input: {
    code: string;
    state: string;
    flowCookie: string;
  }): Promise<{ sessionCookie: string; identity: SessionIdentity }> {
    const id = this.verify(input.flowCookie);
    const flow = id ? this.flows.get(id) : undefined;
    if (id) this.flows.delete(id);
    if (
      !flow ||
      flow.expiresAt <= this.now().getTime() ||
      !equal(flow.state, input.state)
    ) {
      throw new Error('Fluxo de entrada inválido ou já utilizado.');
    }
    const identity = await this.oidc.exchangeCode({
      code: input.code,
      codeVerifier: flow.codeVerifier,
      expectedNonce: flow.nonce,
    });
    if (
      identity.issuer !== this.config.issuer ||
      !equal(identity.nonce, flow.nonce)
    ) {
      throw new Error('Resposta de identidade inválida.');
    }
    const { nonce: _nonce, ...sessionIdentity } = identity;
    const session = this.sessions.create(sessionIdentity);
    return {
      sessionCookie: this.sign(session.token),
      identity: session.identity,
    };
  }

  async currentSession(
    cookie: string | undefined,
  ): Promise<SessionIdentity | null> {
    if (!cookie) return null;
    const value = this.verify(cookie);
    return value ? this.sessions.get(value) : null;
  }

  async logout(cookie: string | undefined): Promise<string> {
    if (cookie) {
      const value = this.verify(cookie);
      if (value) this.sessions.revoke(value);
    }
    return this.oidc.logoutUrl();
  }

  async setActiveCongregation(
    cookie: string | undefined,
    congregationId: string,
  ): Promise<boolean> {
    if (!cookie) return false;
    const value = this.verify(cookie);
    return value
      ? this.sessions.setActiveCongregation(value, congregationId)
      : false;
  }

  private sign(value: string): string {
    const signature = createHmac('sha256', this.config.sessionSecret)
      .update(value)
      .digest('base64url');
    return `${value}.${signature}`;
  }

  private verify(signed: string): string | null {
    const separator = signed.lastIndexOf('.');
    if (separator < 1) return null;
    const value = signed.slice(0, separator);
    const signature = signed.slice(separator + 1);
    const expected = createHmac('sha256', this.config.sessionSecret)
      .update(value)
      .digest('base64url');
    return equal(signature, expected) ? value : null;
  }
}
