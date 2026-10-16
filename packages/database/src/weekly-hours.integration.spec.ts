import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { IdentityController } from '../../../apps/api/src/identity/identity.controllers.js';
import { IdentityRuntime } from '../../../apps/api/src/identity/identity.runtime.js';
import { PgIdentityRepository } from '../../../apps/api/src/identity/pg-identity.repository.js';
import { MemorySessionStore } from '../../../apps/api/src/auth/session.store.js';
import { runPrisma, withDisposableDatabase } from './test-support/database.js';

const apiRequire = createRequire(
  new URL('../../../apps/api/package.json', import.meta.url),
);
const { Test } = apiRequire('@nestjs/testing');

describe('weekly preaching hours HTTP API and PostgreSQL', () => {
  it('persists independent point schedules, ignores legacy restrictions and validates tenant access, timezone concurrency and intervals', async () => {
    await withDisposableDatabase(async (url, pool) => {
      expect(runPrisma(url, ['migrate', 'deploy'])).toBe(0);
      const sessions = new MemorySessionStore();
      const repository = new PgIdentityRepository(pool);
      const session = sessions.create({
        issuer: 'https://example.test/',
        subject: 'weekly-admin',
        email: 'weekly@example.test',
        emailVerified: true,
      });
      const actor = await repository.syncExternalAccount(session.identity);
      const a = randomUUID(),
        b = randomUUID();
      await pool.query(
        "INSERT INTO congregation (id,name) VALUES ($1,'Weekly A'),($2,'Weekly B')",
        [a, b],
      );
      await pool.query(
        "INSERT INTO membership (id,account_id,congregation_id,role) VALUES ($1,$2,$3,'LOCAL_ADMIN'),($4,$2,$5,'PUBLISHER')",
        [randomUUID(), actor.accountId, a, randomUUID(), b],
      );
      const first = randomUUID(),
        second = randomUUID(),
        foreign = randomUUID();
      await pool.query(
        "INSERT INTO preaching_point (id,congregation_id,name,allowed_types) VALUES ($1,$2,'Saturday market',ARRAY['CART']::equipment_type[]),($3,$2,'Other point',ARRAY['CART']::equipment_type[]),($4,$5,'Foreign point',ARRAY['CART']::equipment_type[])",
        [first, a, second, foreign, b],
      );
      // Congregation-wide restrictions remain historical and are not inherited.
      await pool.query(
        "INSERT INTO weekly_hours_day (congregation_id,day,mode,intervals) VALUES ($1,6,'closed','[]')",
        [a],
      );
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
        const origin = await app.getUrl();
        const endpoint = (id: string = a, pointId: string = first) =>
          `${origin}/api/congregations/${id}/points/${pointId}/weekly-hours`;
        const headers = {
          cookie: `cp_session=${session.token}`,
          'content-type': 'application/json',
          'x-csrf-token': session.identity.csrfToken,
        };
        const get = (id = a) => fetch(endpoint(id), { headers });
        const save = (body: unknown, id = a) =>
          fetch(endpoint(id), {
            method: 'PUT',
            headers,
            body: JSON.stringify(body),
          });
        expect((await fetch(endpoint())).status).toBe(401);
        const initial = await (await get()).json();
        expect(initial).toEqual({
          timezone: 'America/Sao_Paulo',
          version: 0,
          timezoneVersion: 0,
          days: Array.from({ length: 7 }, (_, day) => ({
            day,
            mode: 'unrestricted',
            intervals: [],
          })),
        });
        expect((await fetch(endpoint(a, foreign), { headers })).status).toBe(
          404,
        );
        expect(
          (await fetch(endpoint(a, randomUUID()), { headers })).status,
        ).toBe(404);
        expect((await fetch(endpoint(a, 'invalid'), { headers })).status).toBe(
          400,
        );
        const input = structuredClone(initial);
        input.timezone = 'America/Manaus';
        input.days = input.days.map((day: { day: number }) => ({
          day: day.day,
          mode: 'closed',
          intervals: [],
        }));
        input.days[6] = {
          day: 6,
          mode: 'intervals',
          intervals: [{ start: '06:00', end: '14:00' }],
        };
        expect(
          (
            await fetch(endpoint(), {
              method: 'PUT',
              headers: { ...headers, 'x-csrf-token': '' },
              body: JSON.stringify(input),
            })
          ).status,
        ).toBe(403);
        expect((await save(input)).status).toBe(200);
        const persisted = await (await get()).json();
        expect(persisted).toEqual({ ...input, version: 1, timezoneVersion: 1 });
        expect(
          await (await fetch(endpoint(a, second), { headers })).json(),
        ).toEqual({ ...initial, timezone: input.timezone, timezoneVersion: 1 });
        expect(await (await save(persisted)).json()).toEqual(persisted);
        expect((await save(input)).status).toBe(409);
        for (const intervals of [
          [{ start: '22:00', end: '02:00' }],
          [{ start: '08:00', end: '08:00' }],
          [{ start: '24:00', end: '24:00' }],
          [{ start: '08:00', end: '24:01' }],
          [
            { start: '08:00', end: '12:00' },
            { start: '11:00', end: '14:00' },
          ],
        ]) {
          const invalid = structuredClone(persisted);
          invalid.days[6].intervals = intervals;
          expect((await save(invalid)).status).toBe(400);
        }
        for (const invalid of [
          { ...persisted, timezone: 'Invalid/Zone' },
          { ...persisted, timezone: '+03:00' },
          { ...persisted, congregationId: b },
          { ...persisted, days: [] },
          {
            ...persisted,
            days: [...persisted.days.slice(0, 6), persisted.days[0]],
          },
          {
            ...persisted,
            days: persisted.days.map((day: { day: number }) =>
              day.day === 0
                ? { ...day, intervals: [{ start: '08:00', end: '10:00' }] }
                : day,
            ),
          },
        ])
          expect((await save(invalid)).status).toBe(400);
        expect(await (await get()).json()).toEqual(persisted);
        expect((await get(b)).status).toBe(403);
        expect((await save(persisted, b)).status).toBe(403);
        await pool.query(
          "UPDATE membership SET role='LOCAL_ADMIN' WHERE congregation_id=$1",
          [b],
        );
        expect((await get(b)).status).toBe(404);
        expect(
          await (await fetch(endpoint(b, foreign), { headers })).json(),
        ).toEqual(initial);
        expect(
          (
            await fetch(endpoint(b, first), {
              method: 'PUT',
              headers,
              body: JSON.stringify(persisted),
            })
          ).status,
        ).toBe(404);
        const otherInput = {
          ...initial,
          timezone: persisted.timezone,
          timezoneVersion: 1,
        };
        expect(
          (
            await fetch(endpoint(a, second), {
              method: 'PUT',
              headers,
              body: JSON.stringify(otherInput),
            })
          ).status,
        ).toBe(200);
        const changed = structuredClone(persisted);
        changed.days[6] = { day: 6, mode: 'unrestricted', intervals: [] };
        const results = await Promise.all([
          save(changed),
          save({ ...changed, timezone: 'America/Rio_Branco' }),
        ]);
        expect(results.map((response) => response.status).sort()).toEqual([
          200, 409,
        ]);
        const latest = await (await get()).json();
        const other = await (
          await fetch(endpoint(a, second), { headers })
        ).json();
        expect(other.days).toEqual(initial.days);
        expect(other.version).toBe(0);
        expect(
          (
            await fetch(endpoint(a, second), {
              method: 'PUT',
              headers,
              body: JSON.stringify({ ...other, timezoneVersion: 0 }),
            })
          ).status,
        ).toBe(409);
        expect(latest.version).toBe(2);
        expect(latest.days[6]).toEqual(changed.days[6]);
        expect((await save(latest)).status).toBe(200); // no-op does not create history
        const history = await pool.query(
          'SELECT actor_account_id, previous, configuration FROM point_weekly_hours_history WHERE point_id=$1 ORDER BY created_at',
          [first],
        );
        expect(history.rows).toHaveLength(2);
        expect(history.rows[0]).toMatchObject({
          actor_account_id: actor.accountId,
          previous: initial,
          configuration: persisted,
        });
        await expect(
          pool.query(
            "INSERT INTO point_weekly_hours_day (point_id,day,mode,intervals) VALUES ($1,7,'closed','[]')",
            [first],
          ),
        ).rejects.toMatchObject({ code: '23514' });
        await pool.query(
          "UPDATE membership SET status='REVOKED',revoked_at=now() WHERE congregation_id=$1",
          [a],
        );
        expect((await get()).status).toBe(403);
        expect((await save(latest)).status).toBe(403);
        const unverified = sessions.create({
          ...session.identity,
          emailVerified: false,
        });
        expect(
          (
            await fetch(endpoint(b), {
              headers: { cookie: `cp_session=${unverified.token}` },
            })
          ).status,
        ).toBe(403);
      } finally {
        await app.close();
      }
    });
  }, 120_000);
});
