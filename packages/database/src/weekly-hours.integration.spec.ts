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
  it('persists local weekly hours atomically, validates boundaries and isolates administrators with session and CSRF checks', async () => {
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
        const endpoint = (id = a) =>
          `${origin}/api/congregations/${id}/weekly-hours`;
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
          days: Array.from({ length: 7 }, (_, day) => ({
            day,
            mode: 'unrestricted',
            intervals: [],
          })),
        });
        const input = structuredClone(initial);
        input.timezone = 'America/Manaus';
        input.days[0] = { day: 0, mode: 'closed', intervals: [] };
        input.days[1] = {
          day: 1,
          mode: 'intervals',
          intervals: [
            { start: '08:00', end: '12:00' },
            { start: '14:00', end: '24:00' },
          ],
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
        expect(persisted).toEqual({ ...input, version: 1 });
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
          invalid.days[1].intervals = intervals;
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
        expect(await (await get(b)).json()).toEqual(initial);
        const changed = structuredClone(persisted);
        changed.days[1] = { day: 1, mode: 'unrestricted', intervals: [] };
        const results = await Promise.all([
          save(changed),
          save({ ...changed, timezone: 'America/Rio_Branco' }),
        ]);
        expect(results.map((response) => response.status).sort()).toEqual([
          200, 409,
        ]);
        const latest = await (await get()).json();
        expect(latest.version).toBe(2);
        expect(latest.days[1]).toEqual(changed.days[1]);
        expect((await save(latest)).status).toBe(200); // no-op does not create history
        const history = await pool.query(
          'SELECT actor_account_id, previous, configuration FROM weekly_hours_history WHERE congregation_id=$1 ORDER BY created_at',
          [a],
        );
        expect(history.rows).toHaveLength(2);
        expect(history.rows[0]).toMatchObject({
          actor_account_id: actor.accountId,
          previous: initial,
          configuration: persisted,
        });
        await expect(
          pool.query(
            "INSERT INTO weekly_hours_day (congregation_id,day,mode,intervals) VALUES ($1,7,'closed','[]')",
            [a],
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
