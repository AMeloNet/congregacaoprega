import { createPublicKey, verify } from 'node:crypto';
import type { AuthConfig, OidcClient, OidcIdentity } from './auth.service.js';

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
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as T;
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
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          code: input.code,
          code_verifier: input.codeVerifier,
          redirect_uri: this.config.callbackUrl,
        }),
      },
    );
    if (!response.ok) throw new Error('Não foi possível concluir a entrada.');
    const body = (await response.json()) as { id_token?: string };
    if (!body.id_token) throw new Error('Resposta de identidade inválida.');
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
    if (parts.length !== 3) throw new Error('Resposta de identidade inválida.');
    const header = decodePart<JwtHeader>(parts[0]!);
    const claims = decodePart<JwtClaims>(parts[1]!);
    if (header.alg !== 'RS256' || !header.kid) {
      throw new Error('Resposta de identidade inválida.');
    }
    let keys = await this.getKeys();
    let jwk = keys.find((item) => item.kid === header.kid);
    if (!jwk) {
      keys = await this.getKeys(true);
      jwk = keys.find((item) => item.kid === header.kid);
    }
    if (!jwk) throw new Error('Resposta de identidade inválida.');
    const validSignature = verify(
      'RSA-SHA256',
      Buffer.from(`${parts[0]}.${parts[1]}`),
      createPublicKey({ key: jwk, format: 'jwk' } as Parameters<
        typeof createPublicKey
      >[0]),
      Buffer.from(parts[2]!, 'base64url'),
    );
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (
      !validSignature ||
      claims.iss !== this.config.issuer ||
      !audiences.includes(this.config.clientId) ||
      !claims.exp ||
      claims.exp * 1000 <= Date.now() ||
      claims.nonce !== nonce ||
      !claims.sub ||
      !claims.email
    ) {
      throw new Error('Resposta de identidade inválida.');
    }
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
    );
    if (!response.ok) throw new Error('Não foi possível validar a identidade.');
    const body = (await response.json()) as { keys?: Jwk[] };
    if (!body.keys) throw new Error('Resposta de identidade inválida.');
    this.jwks = body.keys;
    return body.keys;
  }
}
