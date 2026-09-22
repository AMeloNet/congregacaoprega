import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { Auth0OidcClient } from '../auth/auth0-oidc.client.js';
import { AuthService, type AuthConfig } from '../auth/auth.service.js';
import { MemorySessionStore } from '../auth/session.store.js';
import { CaptureEmailService } from './email.service.js';
import { IdentityService } from './identity.service.js';
import { PgIdentityRepository } from './pg-identity.repository.js';

function authConfig(): AuthConfig & { clientSecret: string } {
  const issuer = process.env.AUTH0_ISSUER ?? 'https://test.invalid/';
  return {
    issuer: issuer.endsWith('/') ? issuer : `${issuer}/`,
    clientId: process.env.AUTH0_CLIENT_ID ?? 'test-client',
    clientSecret: process.env.AUTH0_CLIENT_SECRET ?? 'test-secret',
    audience: process.env.AUTH0_AUDIENCE ?? 'https://test.invalid/api',
    callbackUrl:
      process.env.AUTH0_CALLBACK_URL ??
      'http://127.0.0.1:3000/api/auth/callback',
    logoutUrl: process.env.AUTH0_LOGOUT_URL ?? 'http://127.0.0.1:5173/',
    sessionSecret:
      process.env.SESSION_SECRET ?? 'test-session-secret'.padEnd(32, '-'),
    secureCookies: process.env.NODE_ENV === 'production',
  };
}

export function validateIdentityEnvironment(): void {
  const required = [
    'DATABASE_URL',
    'AUTH0_ISSUER',
    'AUTH0_CLIENT_ID',
    'AUTH0_CLIENT_SECRET',
    'AUTH0_AUDIENCE',
    'AUTH0_CALLBACK_URL',
    'AUTH0_LOGOUT_URL',
    'SESSION_SECRET',
    'BOOTSTRAP_SECRET',
    'APP_BASE_URL',
  ];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Required identity configuration is missing: ${missing.join(', ')}`,
    );
  }
  if (process.env.EMAIL_TRANSPORT !== 'capture') {
    throw new Error(
      'EMAIL_TRANSPORT must be capture until an external transport is implemented.',
    );
  }
  if (process.env.SESSION_SECRET!.length < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 characters.');
  }
  const issuer = new URL(process.env.AUTH0_ISSUER!);
  if (issuer.protocol !== 'https:') {
    throw new Error('AUTH0_ISSUER must use HTTPS.');
  }
  for (const name of [
    'AUTH0_CALLBACK_URL',
    'AUTH0_LOGOUT_URL',
    'APP_BASE_URL',
  ]) {
    const url = new URL(process.env[name]!);
    const local = ['127.0.0.1', 'localhost'].includes(url.hostname);
    if (url.protocol !== 'https:' && !local) {
      throw new Error(`${name} must use HTTPS outside local development.`);
    }
  }
}

@Injectable()
export class IdentityRuntime implements OnModuleDestroy {
  readonly pool = new Pool({ connectionString: process.env.DATABASE_URL });
  readonly repository = new PgIdentityRepository(this.pool);
  readonly email = new CaptureEmailService();
  readonly sessions = new MemorySessionStore();
  readonly config = authConfig();
  readonly auth = new AuthService(
    this.config,
    new Auth0OidcClient(this.config),
    this.sessions,
  );
  readonly identity = new IdentityService(this.repository, this.email, {
    appBaseUrl: process.env.APP_BASE_URL ?? 'http://127.0.0.1:5173',
    bootstrapSecret: process.env.BOOTSTRAP_SECRET ?? 'test-bootstrap-secret',
  });

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
