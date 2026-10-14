import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthDiagnosticError } from '../auth/auth-diagnostic.error.js';
import { AuthService } from '../auth/auth.service.js';
import { MemorySessionStore } from '../auth/session.store.js';
import { AuthController } from './identity.controllers.js';
import { IdentityRuntime } from './identity.runtime.js';

describe('Auth callback diagnostics', () => {
  it('logs safe flow, token and account stages while keeping HTTP failures generic', async () => {
    const config = {
      issuer: 'https://identity.example.test/',
      clientId: 'test-client',
      audience: 'https://api.example.test',
      callbackUrl: 'https://app.example.test/api/auth/callback',
      logoutUrl: 'https://app.example.test/',
      sessionSecret: 'test-secret'.padEnd(32, '-'),
      secureCookies: true,
    };
    const exchangeCode = vi.fn();
    const auth = new AuthService(
      config,
      {
        authorizationUrl: ({ state, nonce }) =>
          `https://identity.example.test/authorize?state=${state}&nonce=${nonce}`,
        exchangeCode,
        logoutUrl: () => config.logoutUrl,
      },
      new MemorySessionStore(),
    );
    const syncExternalAccount = vi.fn();
    const runtime = { auth, config, repository: { syncExternalAccount } };
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: IdentityRuntime, useValue: runtime }],
    }).compile();
    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    const warning = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    try {
      await app.init();
      const missing = await request(app.getHttpServer())
        .get('/api/auth/callback?code=sensitive-code&state=sensitive-state')
        .expect(401);
      const generic = {
        code: 'INVALID_IDENTITY_RESPONSE',
        message: 'Não foi possível concluir a entrada. Tente novamente.',
      };
      expect(missing.body).toEqual(generic);
      expect(warning).toHaveBeenLastCalledWith(
        'Auth callback failed: stage=login_flow reason=flow_cookie_missing',
      );
      expect(exchangeCode).not.toHaveBeenCalled();

      for (const reason of [
        'token_audience_mismatch',
        'token_nonce_mismatch',
        'token_email_missing',
      ] as const) {
        const login = await auth.beginLogin();
        const state = new URL(login.redirectUrl).searchParams.get('state')!;
        exchangeCode.mockRejectedValueOnce(new AuthDiagnosticError(reason));
        const response = await request(app.getHttpServer())
          .get('/api/auth/callback')
          .query({ code: 'sensitive-code', state })
          .set('Cookie', `cp_login=${login.flowCookie}`)
          .expect(401);
        expect(response.body).toEqual(generic);
        expect(warning).toHaveBeenLastCalledWith(
          `Auth callback failed: stage=id_token_validation reason=${reason}`,
        );
        expect(syncExternalAccount).not.toHaveBeenCalled();
      }

      const login = await auth.beginLogin();
      const url = new URL(login.redirectUrl);
      exchangeCode.mockResolvedValueOnce({
        issuer: config.issuer,
        subject: 'test-subject',
        email: 'admin@example.test',
        emailVerified: true,
        nonce: url.searchParams.get('nonce'),
      });
      syncExternalAccount.mockRejectedValueOnce(
        new Error('sensitive database connection and credential'),
      );
      const response = await request(app.getHttpServer())
        .get('/api/auth/callback')
        .query({ code: 'sensitive-code', state: url.searchParams.get('state') })
        .set('Cookie', `cp_login=${login.flowCookie}`)
        .expect(401);
      expect(response.body).toEqual(generic);
      expect(String(response.headers['set-cookie'])).not.toContain(
        'cp_session=',
      );
      expect(warning).toHaveBeenLastCalledWith(
        'Auth callback failed: stage=account_sync reason=unexpected_failure',
      );
      expect(JSON.stringify(warning.mock.calls)).not.toMatch(
        /sensitive|admin@example.test|test-secret/,
      );
    } finally {
      warning.mockRestore();
      await app.close();
    }
  });
});
