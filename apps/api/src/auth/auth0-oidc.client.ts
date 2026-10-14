import { createPublicKey, verify } from 'node:crypto';
import type { AuthConfig, OidcClient, OidcIdentity } from './auth.service.js';
import { AuthDiagnosticError } from './auth-diagnostic.error.js';

type JwtHeader = { alg?: string; kid?: string };
type JwtClaims = {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  nonce?: string;
  email?: string;
  email_verified?: boolean;
};
type Jwk = JsonWebKey & { kid?: string; alg?: string; use?: string };

function decodePart<T>(part: string): T {
  try {
    const value: unknown = JSON.parse(
      Buffer.from(part, 'base64url').toString('utf8'),
    );
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error();
    return value as T;
  } catch {
    throw new AuthDiagnosticError('token_malformed');
  }
}

export class Auth0OidcClient implements OidcClient {
  private jwks: Jwk[] | undefined;

  constructor(
    private readonly config: AuthConfig & { clientSecret: string },
    private readonly request: typeof fetch = fetch,
  ) {}

  authorizationUrl(input: {
    state: string;
    nonce: string;
    codeChallenge: string;
  }): string {
    const url = new URL('authorize', this.config.issuer);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.callbackUrl,
      scope: 'openid profile email',
      audience: this.config.audience,
      state: input.state,
      nonce: input.nonce,
      code_challenge: input.codeChallenge,
      code_challenge_method: 'S256',
    }).toString();
    return url.toString();
  }

  async exchangeCode(input: {
    code: string;
    codeVerifier: string;
    expectedNonce: string;
  }): Promise<OidcIdentity> {
    const response = await this.request(
      new URL('oauth/token', this.config.issuer),
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          code: input.code,
          code_verifier: input.codeVerifier,
          redirect_uri: this.config.callbackUrl,
        }),
      },
    ).catch(() => {
      throw new AuthDiagnosticError('token_exchange_request_failed');
    });
    if (!response.ok) {
      let providerError = 'unknown';
      try {
        const body = (await response.json()) as { error?: unknown };
        if (
          typeof body.error === 'string' &&
          /^[a-z0-9_]{1,64}$/i.test(body.error)
        ) {
          providerError = body.error;
        }
      } catch {
        // The provider response can be empty or non-JSON; do not expose it.
      }
      throw new Error(
        `Auth0 token exchange failed (${response.status}:${providerError}).`,
      );
    }
    const body = (await response.json().catch(() => {
      throw new AuthDiagnosticError('token_response_invalid');
    })) as { id_token?: string } | null;
    if (!body || typeof body.id_token !== 'string' || !body.id_token)
      throw new AuthDiagnosticError('id_token_missing');
    return this.verifyIdToken(body.id_token, input.expectedNonce);
  }

  logoutUrl(): string {
    const url = new URL('v2/logout', this.config.issuer);
    url.search = new URLSearchParams({
      client_id: this.config.clientId,
      returnTo: this.config.logoutUrl,
    }).toString();
    return url.toString();
  }

  private async verifyIdToken(
    jwt: string,
    nonce: string,
  ): Promise<OidcIdentity> {
    const parts = jwt.split('.');
    if (parts.length !== 3) throw new AuthDiagnosticError('token_malformed');
    const header = decodePart<JwtHeader>(parts[0]!);
    const claims = decodePart<JwtClaims>(parts[1]!);
    if (header.alg !== 'RS256' || !header.kid) {
      throw new AuthDiagnosticError('token_algorithm_invalid');
    }
    let keys = await this.getKeys();
    let jwk = keys.find((item) => item.kid === header.kid);
    if (!jwk) {
      keys = await this.getKeys(true);
      jwk = keys.find((item) => item.kid === header.kid);
    }
    if (!jwk) throw new AuthDiagnosticError('token_key_missing');
    const validSignature = verify(
      'RSA-SHA256',
      Buffer.from(`${parts[0]}.${parts[1]}`),
      createPublicKey({ key: jwk, format: 'jwk' } as Parameters<
        typeof createPublicKey
      >[0]),
      Buffer.from(parts[2]!, 'base64url'),
    );
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!validSignature)
      throw new AuthDiagnosticError('token_signature_invalid');
    if (claims.iss !== this.config.issuer)
      throw new AuthDiagnosticError('token_issuer_mismatch');
    if (!audiences.includes(this.config.clientId))
      throw new AuthDiagnosticError('token_audience_mismatch');
    if (!claims.exp || claims.exp * 1000 <= Date.now())
      throw new AuthDiagnosticError('token_expired');
    if (claims.nonce !== nonce)
      throw new AuthDiagnosticError('token_nonce_mismatch');
    if (!claims.sub) throw new AuthDiagnosticError('token_subject_missing');
    if (!claims.email) throw new AuthDiagnosticError('token_email_missing');
    return {
      issuer: claims.iss,
      subject: claims.sub,
      email: claims.email,
      emailVerified: claims.email_verified === true,
      nonce,
    };
  }

  private async getKeys(refresh = false): Promise<Jwk[]> {
    if (this.jwks && !refresh) return this.jwks;
    const response = await this.request(
      new URL('.well-known/jwks.json', this.config.issuer),
    ).catch(() => {
      throw new AuthDiagnosticError('jwks_unavailable');
    });
    if (!response.ok) throw new AuthDiagnosticError('jwks_unavailable');
    const body = (await response.json().catch(() => {
      throw new AuthDiagnosticError('jwks_invalid');
    })) as { keys?: Jwk[] } | null;
    if (!body || !Array.isArray(body.keys))
      throw new AuthDiagnosticError('jwks_invalid');
    this.jwks = body.keys;
    return body.keys;
  }
}
