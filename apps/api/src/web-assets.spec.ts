import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { configureWebAssets } from './web-assets.js';

describe('web asset routing', () => {
  let publicDirectory: string;

  beforeEach(async () => {
    publicDirectory = await mkdtemp(join(tmpdir(), 'congregacaoprega-web-'));
    await writeFile(
      join(publicDirectory, 'index.html'),
      '<!doctype html><title>congregacaoprega invitation</title>',
    );
  });

  afterEach(async () => {
    await rm(publicDirectory, { recursive: true, force: true });
  });

  it('serves the SPA entry point for a direct invitation link', async () => {
    const moduleRef = await Test.createTestingModule({}).compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>();
    app.setGlobalPrefix('api');
    configureWebAssets(app, publicDirectory);
    await app.init();

    await request(app.getHttpServer())
      .get('/convites/invite-token')
      .expect('Content-Type', /html/)
      .expect(200)
      .expect(/congregacaoprega invitation/);

    await app.close();
  });

  it('does not turn an unknown API route into an HTML response', async () => {
    const moduleRef = await Test.createTestingModule({}).compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>();
    app.setGlobalPrefix('api');
    configureWebAssets(app, publicDirectory);
    await app.init();

    await request(app.getHttpServer())
      .get('/api/unknown')
      .expect('Content-Type', /json/)
      .expect(404);

    await app.close();
  });
});
