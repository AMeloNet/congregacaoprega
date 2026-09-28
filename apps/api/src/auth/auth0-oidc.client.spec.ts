import { generateKeyPairSync, sign } from 'node:crypto';
import { Auth0OidcClient } from './auth0-oidc.client.js';

const config = {
  issuer: 'https://tenant.example.test/',
  clientId: 'client-id',
  clientSecret: 'client-secret',
  audience: 'https://api.example.test',
  callbackUrl: 'https://app.example.test/api/auth/callback',
  logoutUrl: 'https://app.example.test/',
  sessionSecret: 'a'.repeat(32),
  secureCookies: true,
};

function createToken(claims: Record<string, unknown>) {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const header = Buffer.from(
    JSON.stringify({ alg: 'RS256', kid: 'test-key', typ: 'JWT' }),
  ).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = sign(
    'RSA-SHA256',
    Buffer.from(`${header}.${payload}`),
    privateKey,
  ).toString('base64url');
  return {
    token: `${header}.${payload}.${signature}`,
    jwk: { ...publicKey.export({ format: 'jwk' }), kid: 'test-key' },
  };
}

function clientFor(token: string, jwk: JsonWebKey) {
  const request = vi.fn(async (input: string | URL | Request) => {
    const url = input.toString();
    if (url.endsWith('/oauth/token')) {
      return new Response(JSON.stringify({ id_token: token }), { status: 200 });
    }
    return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
  });
  return new Auth0OidcClient(config, request);
}

describe('Auth0 OIDC token validation', () => {
  it('exchanges the authorization code using form-encoded client-secret post authentication', async () => {
    const issued = createToken({
      iss: config.issuer,
      sub: 'auth0|person',
      aud: config.clientId,
      exp: Math.floor(Date.now() / 1000) + 60,
      nonce: 'expected-nonce',
      email: 'person@example.test',
    });
    const request = vi.fn(
      async (input: string | URL | Request, _init?: RequestInit) => {
        if (input.toString().endsWith('/oauth/token')) {
          return new Response(JSON.stringify({ id_token: issued.token }), {
            status: 200,
          });
        }
        return new Response(JSON.stringify({ keys: [issued.jwk] }), {
          status: 200,
        });
      },
    );
    const client = new Auth0OidcClient(config, request);

    await client.exchangeCode({
      code: 'one-use-code',
      codeVerifier: 'verifier',
      expectedNonce: 'expected-nonce',
    });

    const [, init] = request.mock.calls[0]!;
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
    });
    expect(init?.body?.toString()).toBe(
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code: 'one-use-code',
        code_verifier: 'verifier',
        redirect_uri: config.callbackUrl,
      }).toString(),
    );
  });

  it('accepts a signed, current token with exact issuer, audience and nonce', async () => {
    const issued = createToken({
      iss: config.issuer,
      sub: 'auth0|person',
      aud: config.clientId,
      exp: Math.floor(Date.now() / 1000) + 60,
      nonce: 'expected-nonce',
      email: 'person@example.test',
      email_verified: true,
    });
    await expect(
      clientFor(issued.token, issued.jwk).exchangeCode({
        code: 'one-use-code',
        codeVerifier: 'verifier',
        expectedNonce: 'expected-nonce',
      }),
    ).resolves.toMatchObject({
      subject: 'auth0|person',
      emailVerified: true,
    });
  });

  it.each([
    {
      aud: 'another-client',
      exp: Math.floor(Date.now() / 1000) + 60,
      nonce: 'expected-nonce',
    },
    {
      aud: config.clientId,
      exp: Math.floor(Date.now() / 1000) - 1,
      nonce: 'expected-nonce',
    },
    {
      aud: config.clientId,
      exp: Math.floor(Date.now() / 1000) + 60,
      nonce: 'another-nonce',
    },
  ])(
    'rejects invalid claims without exposing the token: %o',
    async (invalid) => {
      const issued = createToken({
        iss: config.issuer,
        sub: 'auth0|person',
        email: 'person@example.test',
        email_verified: true,
        ...invalid,
      });
      await expect(
        clientFor(issued.token, issued.jwk).exchangeCode({
          code: 'one-use-code',
          codeVerifier: 'verifier',
          expectedNonce: 'expected-nonce',
        }),
      ).rejects.toThrow('Resposta de identidade inválida.');
    },
  );
});
