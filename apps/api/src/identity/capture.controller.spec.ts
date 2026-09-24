import { createHmac } from 'node:crypto';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CaptureAccessService } from './capture-access.service.js';
import { CaptureController } from './capture.controller.js';
import { CaptureEmailService } from './email.service.js';
import { IdentityRuntime } from './identity.runtime.js';

const secret = 'capture-operator-secret-32-characters';
const now = new Date('2026-09-23T12:00:00Z');

function headers(method: string, path: string, requestId: string) {
  const timestamp = now.getTime().toString();
  const signature = createHmac('sha256', secret)
    .update(`${method}\n${path}\n${timestamp}\n${requestId}`)
    .digest('hex');
  return {
    'x-capture-timestamp': timestamp,
    'x-capture-request-id': requestId,
    'x-capture-signature': signature,
  };
}

describe('PBL-002A capture HTTP boundary', () => {
  it('denies unauthenticated access and exposes only redacted metadata', async () => {
    const email = new CaptureEmailService({
      id: () => 'opaque-capture-id',
      now: () => now,
    });
    await email.send({
      to: 'master@example.test',
      template: 'master-bootstrap',
      parameters: { link: 'https://app.example.test/convites/private-token' },
    });
    const runtime = {
      email,
      captureAccess: new CaptureAccessService(secret, () => now),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [CaptureController],
      providers: [{ provide: IdentityRuntime, useValue: runtime }],
    }).compile();
    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    const denied = await request(app.getHttpServer())
      .get('/api/operations/email-capture')
      .expect(404);
    expect(denied.body).toEqual({
      code: 'NOT_FOUND',
      message: 'Recurso não encontrado.',
    });
    expect(denied.headers['cache-control']).toBe('no-store');

    const authorized = await request(app.getHttpServer())
      .get('/api/operations/email-capture')
      .set(
        headers(
          'GET',
          '/api/operations/email-capture',
          'list-request-1234567890123456',
        ),
      )
      .set('Origin', 'https://external.example.test')
      .expect(200);
    expect(authorized.body).toEqual([
      expect.objectContaining({
        id: 'opaque-capture-id',
        to: '***@example.test',
      }),
    ]);
    expect(JSON.stringify(authorized.body)).not.toContain('private-token');
    expect(authorized.headers['access-control-allow-origin']).toBeUndefined();
    expect(
      authorized.headers['access-control-allow-credentials'],
    ).toBeUndefined();
    expect(authorized.headers['cache-control']).toBe('no-store');
    await app.close();
  });

  it('consumes content once and does not reveal whether it existed', async () => {
    const email = new CaptureEmailService({
      id: () => 'opaque-capture-id',
      now: () => now,
    });
    await email.send({
      to: 'master@example.test',
      template: 'master-bootstrap',
      parameters: { link: 'https://app.example.test/convites/private-token' },
    });
    const runtime = {
      email,
      captureAccess: new CaptureAccessService(secret, () => now),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [CaptureController],
      providers: [{ provide: IdentityRuntime, useValue: runtime }],
    }).compile();
    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    const path = '/api/operations/email-capture/opaque-capture-id';

    const consumed = await request(app.getHttpServer())
      .delete(path)
      .set(headers('DELETE', path, 'consume-request-12345678901234'))
      .expect(200);
    expect(consumed.body.parameters.link).toContain('private-token');

    const missing = await request(app.getHttpServer())
      .delete(path)
      .set(headers('DELETE', path, 'missing-request-12345678901234'))
      .expect(404);
    expect(missing.body).toEqual({
      code: 'NOT_FOUND',
      message: 'Recurso não encontrado.',
    });
    await app.close();
  });
});
