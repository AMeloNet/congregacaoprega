import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { IdentityController } from '../../../apps/api/src/identity/identity.controllers.js';
import { IdentityRuntime } from '../../../apps/api/src/identity/identity.runtime.js';
import { PgIdentityRepository } from '../../../apps/api/src/identity/pg-identity.repository.js';
import { MemorySessionStore } from '../../../apps/api/src/auth/session.store.js';
import { MonthlyScheduleService } from '../../../apps/api/src/monthly-schedule.service.js';
import { runPrisma, withDisposableDatabase } from './test-support/database.js';

const apiRequire = createRequire(
  new URL('../../../apps/api/package.json', import.meta.url),
);
const { Test } = apiRequire('@nestjs/testing');

describe('monthly schedule HTTP API and PostgreSQL', () => {
  it('opens the local current and next month, integrates real resources and preserves tenant and permanent publisher locks', async () => {
    await withDisposableDatabase(async (url, pool) => {
      expect(runPrisma(url, ['migrate', 'deploy'])).toBe(0);
      const sessions = new MemorySessionStore();
      const repository = new PgIdentityRepository(pool);
      const session = sessions.create({
        issuer: 'https://example.test/',
        subject: 'monthly-admin',
        email: 'monthly@example.test',
        emailVerified: true,
      });
      const publisher = sessions.create({
        issuer: 'https://example.test/',
        subject: 'monthly-publisher',
        email: 'publisher@example.test',
        emailVerified: true,
      });
      const actor = await repository.syncExternalAccount(session.identity);
      const reader = await repository.syncExternalAccount(publisher.identity);
      const a = randomUUID(),
        b = randomUUID(),
        point = randomUUID();
      await pool.query(
        "INSERT INTO congregation (id,name,timezone) VALUES ($1,'Monthly A','America/Sao_Paulo'),($2,'Monthly B','Pacific/Kiritimati')",
        [a, b],
      );
      await pool.query(
        "INSERT INTO membership (id,account_id,congregation_id,role) VALUES ($1,$2,$3,'LOCAL_ADMIN'),($4,$5,$3,'PUBLISHER')",
        [randomUUID(), actor.accountId, a, randomUUID(), reader.accountId],
      );
      await pool.query(
        "INSERT INTO preaching_point (id,congregation_id,name,allowed_types) VALUES ($1,$2,'Point',ARRAY['CART']::equipment_type[])",
        [point, a],
      );
      await pool.query(
        "INSERT INTO point_weekly_hours_day (point_id,day,mode,intervals) VALUES ($1,0,'closed','[]')",
        [point],
      );
      await pool.query(
        "INSERT INTO equipment (id,congregation_id,name,type) VALUES ($1,$2,'Cart','CART')",
        [randomUUID(), a],
      );
      const service = new MonthlyScheduleService(
        pool,
        () => new Date('2027-01-01T01:00:00Z'),
      );
      const local = await service.execute(actor.accountId, a, 'get');
      expect(local.months).toEqual([
        { month: '2026-12', state: 'open', canBook: true },
        { month: '2027-01', state: 'open', canBook: true },
      ]);
      expect(local.points[0]).toMatchObject({
        id: point,
        capacity: 1,
        allowedTypes: ['CART'],
      });
      expect(local.points[0].days[0]).toMatchObject({ mode: 'closed' });
      expect(local.points[0].days[1]).toMatchObject({ mode: 'unrestricted' });
      expect(local.equipment).toEqual([{ type: 'CART', units: 1 }]);
      const moduleRef = await Test.createTestingModule({
        controllers: [IdentityController],
        providers: [
          {
            provide: IdentityRuntime,
            useValue: {
              pool,
              repository,
              auth: {
                currentSession: async (token: string) => sessions.get(token),
              },
            },
          },
        ],
      }).compile();
      const app = moduleRef.createNestApplication();
      app.setGlobalPrefix('api');
      await app.listen(0, '127.0.0.1');
      try {
        const endpoint = `${await app.getUrl()}/api/congregations/${a}/schedule`;
        const headers = {
          cookie: `cp_session=${session.token}`,
          'x-csrf-token': session.identity.csrfToken,
        };
        expect((await fetch(endpoint)).status).toBe(401);
        const initial = await (await fetch(endpoint, { headers })).json();
        const month = initial.months[0].month;
        expect(
          (
            await fetch(endpoint, {
              headers: { cookie: `cp_session=${publisher.token}` },
            })
          ).status,
        ).toBe(200);
        expect((await fetch(endpoint.replace(a, b), { headers })).status).toBe(
          403,
        );
        const change = (action: string, tokenHeaders = headers) =>
          fetch(`${endpoint}/${month}/${action}`, {
            method: 'POST',
            headers: tokenHeaders,
          });
        expect(
          (await change('finalize', { ...headers, 'x-csrf-token': '' })).status,
        ).toBe(403);
        expect(
          (
            await change('finalize', {
              cookie: `cp_session=${publisher.token}`,
              'x-csrf-token': publisher.identity.csrfToken,
            })
          ).status,
        ).toBe(403);
        const results = await Promise.all([
          change('finalize'),
          change('finalize'),
        ]);
        expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
        const reopened = await (await change('reopen')).json();
        expect(reopened.months[0]).toEqual({
          month,
          state: 'reopened',
          canBook: false,
        });
        expect(reopened.months[1]).toEqual(initial.months[1]);
        expect((await change('finalize')).status).toBe(201);
        expect(
          (
            await pool.query(
              'SELECT * FROM schedule_month_history WHERE congregation_id=$1',
              [a],
            )
          ).rowCount,
        ).toBe(3);
        await pool.query(
          "UPDATE membership SET status='REVOKED',revoked_at=now() WHERE account_id=$1",
          [reader.accountId],
        );
        expect(
          (
            await fetch(endpoint, {
              headers: { cookie: `cp_session=${publisher.token}` },
            })
          ).status,
        ).toBe(403);
      } finally {
        await app.close();
      }
    });
  }, 120_000);
});
