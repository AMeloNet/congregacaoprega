import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { AuthenticatedIdentity } from './identity.service.js';
import { IdentityController } from './identity.controllers.js';
import { IdentityRuntime } from './identity.runtime.js';

const session = {
  issuer: 'https://identity.example.test/',
  subject: 'local',
  email: 'local@example.test',
  emailVerified: true,
  csrfToken: 'csrf-token',
};
const account: AuthenticatedIdentity = {
  accountId: 'local-account',
  email: session.email,
  emailVerified: true,
  isMaster: false,
};

function controlledRuntime() {
  return {
    auth: {
      currentSession: vi.fn(async () => session),
      setActiveCongregation: vi.fn(async () => true),
    },
    repository: {
      syncExternalAccount: vi.fn(async () => account),
      membership: vi.fn(async () => ({
        id: 'membership',
        accountId: account.accountId,
        congregationId: 'cong-a',
        role: 'LOCAL_ADMIN',
        status: 'ACTIVE',
      })),
    },
    identity: {
      sessionFor: vi.fn(async () => ({
        authenticated: true,
        email: account.email,
        emailVerified: true,
        isMaster: false,
        memberships: [],
        adminCongregations: [],
      })),
      issueMasterBootstrap: vi.fn(async () => ({
        token: 'must-not-leave-the-server',
        invitationId: 'invitation-id',
        expiresAt: new Date('2026-09-22T12:00:00Z'),
      })),
      inviteMember: vi.fn(async () => {
        throw new Error('Recurso não encontrado.');
      }),
    },
  };
}

describe('IDN-001C HTTP boundaries', () => {
  it('does not return the bootstrap token and requires CSRF for mutations', async () => {
    const runtime = controlledRuntime();
    const moduleRef = await Test.createTestingModule({
      controllers: [IdentityController],
      providers: [{ provide: IdentityRuntime, useValue: runtime }],
    }).compile();
    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    const bootstrap = await request(app.getHttpServer())
      .post('/api/bootstrap/master')
      .set('x-bootstrap-secret', 'controlled')
      .send({ email: 'master@example.test' })
      .expect(201);
    expect(bootstrap.body).toEqual({
      invitationId: 'invitation-id',
      expiresAt: '2026-09-22T12:00:00.000Z',
    });
    expect(JSON.stringify(bootstrap.body)).not.toContain('must-not-leave');

    await request(app.getHttpServer())
      .post('/api/congregations/cong-a/invitations/publisher')
      .set('Cookie', 'cp_session=opaque')
      .send({ email: 'publisher@example.test' })
      .expect(403)
      .expect(({ body }) => expect(body.code).toBe('INVALID_CSRF'));
    await app.close();
  });

  it('maps cross-tenant denial to a non-revealing not-found response', async () => {
    const runtime = controlledRuntime();
    const moduleRef = await Test.createTestingModule({
      controllers: [IdentityController],
      providers: [{ provide: IdentityRuntime, useValue: runtime }],
    }).compile();
    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    const response = await request(app.getHttpServer())
      .post('/api/congregations/another-congregation/invitations/publisher')
      .set('Cookie', 'cp_session=opaque')
      .set('x-csrf-token', 'csrf-token')
      .send({ email: 'publisher@example.test' })
      .expect(404);
    expect(response.body).toEqual({
      code: 'NOT_FOUND',
      message: 'Recurso não encontrado.',
    });
    expect(JSON.stringify(response.body)).not.toContain('another-congregation');
    await app.close();
  });
});
