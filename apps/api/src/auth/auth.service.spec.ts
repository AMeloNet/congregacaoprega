import { AuthService, type OidcClient } from './auth.service.js';
import { MemorySessionStore } from './session.store.js';

const config = {
  issuer: 'https://tenant.example.test/',
  clientId: 'client-id',
  audience: 'https://api.example.test',
  callbackUrl: 'https://app.example.test/api/auth/callback',
  logoutUrl: 'https://app.example.test/',
  sessionSecret: 'a'.repeat(32),
  secureCookies: true,
};

function oidc(overrides: Partial<OidcClient> = {}): OidcClient {
  return {
    authorizationUrl: vi.fn(({ state, nonce, codeChallenge }) => {
      const url = new URL('https://tenant.example.test/authorize');
      url.search = new URLSearchParams({
        state,
        nonce,
        codeChallenge,
      }).toString();
      return url.toString();
    }),
    exchangeCode: vi.fn(async () => ({
      issuer: config.issuer,
      subject: 'auth0|person-1',
      email: 'person@example.test',
      emailVerified: true,
      nonce: '',
    })),
    logoutUrl: vi.fn(() => 'https://tenant.example.test/v2/logout'),
    ...overrides,
  };
}

describe('IDN-001C authentication', () => {
  it('uses state, nonce and PKCE and rejects a repeated callback', async () => {
    const client = oidc();
    const service = new AuthService(config, client, new MemorySessionStore());
    const login = await service.beginLogin();
    const authorize = new URL(login.redirectUrl);

    expect(authorize.searchParams.get('state')).toHaveLength(43);
    expect(authorize.searchParams.get('nonce')).toHaveLength(43);
    expect(authorize.searchParams.get('codeChallenge')).toHaveLength(43);

    vi.mocked(client.exchangeCode).mockResolvedValueOnce({
      issuer: config.issuer,
      subject: 'auth0|person-1',
      email: 'person@example.test',
      emailVerified: true,
      nonce: authorize.searchParams.get('nonce')!,
    });
    const callback = await service.completeLogin({
      code: 'single-use-code',
      state: authorize.searchParams.get('state')!,
      flowCookie: login.flowCookie,
    });

    expect(callback.sessionCookie).not.toContain('single-use-code');
    expect(await service.currentSession(callback.sessionCookie)).toMatchObject({
      subject: 'auth0|person-1',
      emailVerified: true,
    });
    await expect(
      service.completeLogin({
        code: 'single-use-code',
        state: authorize.searchParams.get('state')!,
        flowCookie: login.flowCookie,
      }),
    ).rejects.toThrow('Fluxo de entrada inválido ou já utilizado.');
  });

  it('rejects state or nonce mismatch and expires and revokes local sessions', async () => {
    let now = new Date('2026-09-21T12:00:00Z');
    const client = oidc();
    const store = new MemorySessionStore(() => now);
    const service = new AuthService(config, client, store, () => now);
    const login = await service.beginLogin();

    await expect(
      service.completeLogin({
        code: 'code',
        state: 'wrong-state',
        flowCookie: login.flowCookie,
      }),
    ).rejects.toThrow('Fluxo de entrada inválido ou já utilizado.');

    const second = await service.beginLogin();
    const secondUrl = new URL(second.redirectUrl);
    vi.mocked(client.exchangeCode).mockResolvedValueOnce({
      issuer: config.issuer,
      subject: 'auth0|person-1',
      email: 'person@example.test',
      emailVerified: true,
      nonce: 'wrong-nonce',
    });
    await expect(
      service.completeLogin({
        code: 'code',
        state: secondUrl.searchParams.get('state')!,
        flowCookie: second.flowCookie,
      }),
    ).rejects.toThrow('Resposta de identidade inválida.');

    const third = await service.beginLogin();
    const thirdUrl = new URL(third.redirectUrl);
    vi.mocked(client.exchangeCode).mockResolvedValueOnce({
      issuer: config.issuer,
      subject: 'auth0|person-1',
      email: 'person@example.test',
      emailVerified: true,
      nonce: thirdUrl.searchParams.get('nonce')!,
    });
    const callback = await service.completeLogin({
      code: 'code-2',
      state: thirdUrl.searchParams.get('state')!,
      flowCookie: third.flowCookie,
    });
    await service.logout(callback.sessionCookie);
    expect(await service.currentSession(callback.sessionCookie)).toBeNull();

    const fourth = await service.beginLogin();
    const fourthUrl = new URL(fourth.redirectUrl);
    vi.mocked(client.exchangeCode).mockResolvedValueOnce({
      issuer: config.issuer,
      subject: 'auth0|person-1',
      email: 'person@example.test',
      emailVerified: true,
      nonce: fourthUrl.searchParams.get('nonce')!,
    });
    const expiring = await service.completeLogin({
      code: 'code-3',
      state: fourthUrl.searchParams.get('state')!,
      flowCookie: fourth.flowCookie,
    });
    now = new Date('2026-09-22T00:01:00Z');
    expect(await service.currentSession(expiring.sessionCookie)).toBeNull();
  });
});
