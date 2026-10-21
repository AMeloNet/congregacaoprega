import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { RecurrenceService } from '../recurrence.service.js';
import { ScheduleNoticesService } from '../schedule-notices.service.js';
import {
  scheduleEmailConfiguration,
  ResendScheduleTransport,
} from '../schedule-email.transport.js';
import { Pool } from 'pg';
import { Auth0OidcClient } from '../auth/auth0-oidc.client.js';
import { AuthService, type AuthConfig } from '../auth/auth.service.js';
import { MemorySessionStore } from '../auth/session.store.js';
import { CaptureAccessService } from './capture-access.service.js';
import { CaptureEmailService } from './email.service.js';
import {
  invitationEmailConfiguration,
  ResendInvitationTransport,
} from './invitation-email.transport.js';
import { InvitationEmailService } from './invitation-email.service.js';
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
  scheduleEmailConfiguration();
  invitationEmailConfiguration();
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
    'CAPTURE_OPERATOR_SECRET',
    'APP_BASE_URL',
  ];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Required identity configuration is missing: ${missing.join(', ')}`,
    );
  }
  if (process.env.EMAIL_TRANSPORT !== 'capture') {
    throw new Error('EMAIL_TRANSPORT must be capture for identity messages.');
  }
  if (process.env.SESSION_SECRET!.length < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 characters.');
  }
  if (process.env.BOOTSTRAP_SECRET!.length < 32) {
    throw new Error('BOOTSTRAP_SECRET must contain at least 32 characters.');
  }
  if (process.env.CAPTURE_OPERATOR_SECRET!.length < 32) {
    throw new Error(
      'CAPTURE_OPERATOR_SECRET must contain at least 32 characters.',
    );
  }
  if (
    new Set([
      process.env.SESSION_SECRET,
      process.env.BOOTSTRAP_SECRET,
      process.env.CAPTURE_OPERATOR_SECRET,
    ]).size !== 3
  ) {
    throw new Error('Operational secrets must be distinct.');
  }
  let issuer: URL;
  try {
    issuer = new URL(process.env.AUTH0_ISSUER!);
  } catch {
    throw new Error('AUTH0_ISSUER must be a valid URL.');
  }
  if (issuer.protocol !== 'https:') {
    throw new Error('AUTH0_ISSUER must use HTTPS.');
  }
  const configuredUrls = new Map<string, URL>();
  for (const name of [
    'AUTH0_CALLBACK_URL',
    'AUTH0_LOGOUT_URL',
    'APP_BASE_URL',
  ]) {
    let url: URL;
    try {
      url = new URL(process.env[name]!);
    } catch {
      throw new Error(`${name} must be a valid URL.`);
    }
    const local = ['127.0.0.1', 'localhost'].includes(url.hostname);
    if (url.protocol !== 'https:' && !local) {
      throw new Error(`${name} must use HTTPS outside local development.`);
    }
    configuredUrls.set(name, url);
  }
  if (process.env.NODE_ENV === 'production') {
    const base = configuredUrls.get('APP_BASE_URL')!;
    const callback = configuredUrls.get('AUTH0_CALLBACK_URL')!;
    const logout = configuredUrls.get('AUTH0_LOGOUT_URL')!;
    if (callback.origin !== base.origin) {
      throw new Error('AUTH0_CALLBACK_URL must use APP_BASE_URL origin.');
    }
    if (logout.origin !== base.origin) {
      throw new Error('AUTH0_LOGOUT_URL must use APP_BASE_URL origin.');
    }
    if (
      base.pathname !== '/' ||
      base.search ||
      base.hash ||
      callback.pathname !== '/api/auth/callback' ||
      callback.search ||
      callback.hash ||
      logout.pathname !== '/' ||
      logout.search ||
      logout.hash
    ) {
      throw new Error('Application and Auth0 URLs must use canonical paths.');
    }
  }
}

@Injectable()
export class IdentityRuntime implements OnModuleDestroy, OnModuleInit {
  readonly pool = new Pool({ connectionString: process.env.DATABASE_URL });
  readonly repository = new PgIdentityRepository(this.pool);
  readonly email = new CaptureEmailService();
  readonly scheduleEmailConfig = scheduleEmailConfiguration();
  readonly invitationEmailConfig = invitationEmailConfiguration();
  readonly scheduleEmail =
    this.scheduleEmailConfig.transport === 'resend'
      ? new ResendScheduleTransport(
          this.scheduleEmailConfig.apiKey,
          this.scheduleEmailConfig.from,
        )
      : this.email;
  readonly invitationEmail =
    this.invitationEmailConfig.transport === 'resend'
      ? new ResendInvitationTransport(
          this.invitationEmailConfig.apiKey,
          this.invitationEmailConfig.from,
        )
      : this.email;
  readonly captureAccess = new CaptureAccessService(
    process.env.CAPTURE_OPERATOR_SECRET ??
      'test-capture-operator-secret'.padEnd(32, '-'),
  );
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
    queueOnly: true,
  });
  private recurrenceTimer?: ReturnType<typeof setInterval>;
  private recurrenceTask?: Promise<void>;
  private noticesTimer?: ReturnType<typeof setInterval>;
  private noticesTask?: Promise<void>;
  private invitationEmailTimer?: ReturnType<typeof setInterval>;
  private invitationEmailTask?: Promise<void>;

  onModuleInit() {
    const tick = () => {
      if (this.recurrenceTask) return;
      this.recurrenceTask = new RecurrenceService(this.pool)
        .generateAll()
        .catch(() =>
          Logger.warn(
            'Falha no processamento de recorrências. Nova tentativa no próximo ciclo.',
            'Recurrence',
          ),
        )
        .finally(() => {
          this.recurrenceTask = undefined;
        });
    };
    this.recurrenceTimer = setInterval(tick, 60_000);
    this.recurrenceTimer.unref();
    tick();
    const noticesTick = () => {
      if (this.noticesTask) return;
      this.noticesTask = new ScheduleNoticesService(
        this.pool,
        this.scheduleEmail,
      )
        .process()
        .catch(() =>
          Logger.warn(
            'Falha no processamento de avisos. Nova tentativa no próximo ciclo.',
            'ScheduleNotices',
          ),
        )
        .finally(() => {
          this.noticesTask = undefined;
        });
    };
    this.noticesTimer = setInterval(noticesTick, 30_000);
    this.noticesTimer.unref();
    noticesTick();
    const invitationsTick = () => {
      if (this.invitationEmailTask) return;
      this.invitationEmailTask = new InvitationEmailService(
        this.pool,
        this.invitationEmail,
      )
        .deliver()
        .catch(() =>
          Logger.warn(
            'Falha no processamento de e-mails de convite. Nova tentativa no próximo ciclo.',
            'InvitationEmail',
          ),
        )
        .finally(() => {
          this.invitationEmailTask = undefined;
        });
    };
    this.invitationEmailTimer = setInterval(invitationsTick, 30_000);
    this.invitationEmailTimer.unref();
    invitationsTick();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.recurrenceTimer) clearInterval(this.recurrenceTimer);
    if (this.noticesTimer) clearInterval(this.noticesTimer);
    if (this.invitationEmailTimer) clearInterval(this.invitationEmailTimer);
    await this.recurrenceTask;
    await this.noticesTask;
    await this.invitationEmailTask;
    await this.pool.end();
  }
}
