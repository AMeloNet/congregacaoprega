import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './app.module.js';
import { DatabaseHealth } from './health.js';

describe('health endpoints', () => {
  it('reports that the API process is alive', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    await request(app.getHttpServer())
      .get('/api/health/live')
      .expect(200)
      .expect({ status: 'ok' });

    await app.close();
  });

  it('reports unavailable when the database cannot be reached', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseHealth)
      .useValue({ isReady: async () => false })
      .compile();
    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    await request(app.getHttpServer())
      .get('/api/health/ready')
      .expect(503)
      .expect({ status: 'unavailable' });

    await app.close();
  });
});
