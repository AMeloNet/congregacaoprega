import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { IdentityController } from '../../../apps/api/src/identity/identity.controllers.js';
import { IdentityRuntime } from '../../../apps/api/src/identity/identity.runtime.js';
import { PgIdentityRepository } from '../../../apps/api/src/identity/pg-identity.repository.js';
import { MemorySessionStore } from '../../../apps/api/src/auth/session.store.js';
import {
  followingMonth,
  localMonth,
} from '../../../apps/api/src/monthly-schedule.service.js';
import { localInstant } from '../../../apps/api/src/reservation-time.js';
import { runPrisma, withDisposableDatabase } from './test-support/database.js';
const { Test } = createRequire(
  new URL('../../../apps/api/package.json', import.meta.url),
)('@nestjs/testing');

describe('minimal reservations HTTP and PostgreSQL', () => {
  it('creates idempotently and rejects resource, participant, hours, daily, configuration, tenant and finalized-month conflicts atomically', async () => {
    await withDisposableDatabase(async (url, pool) => {
      expect(runPrisma(url, ['migrate', 'deploy'])).toBe(0);
      const sessions = new MemorySessionStore(),
        repository = new PgIdentityRepository(pool);
      const congregation = randomUUID(),
        foreign = randomUUID(),
        point = randomUUID(),
        other = randomUUID(),
        equipment = randomUUID();
      await pool.query(
        "INSERT INTO congregation (id,name) VALUES ($1,'Booking test'),($2,'Other test')",
        [congregation, foreign],
      );
      const users: { headers: Record<string, string> }[] = [];
      for (let index = 0; index < 3; index++) {
        const session = sessions.create({
          issuer: 'https://example.test/',
          subject: `booking-${index}`,
          email: `booking-${index}@example.test`,
          emailVerified: true,
        });
        const account = await repository.syncExternalAccount(session.identity);
        await pool.query(
          'INSERT INTO membership (id,account_id,congregation_id,role) VALUES ($1,$2,$3,$4)',
          [
            randomUUID(),
            account.accountId,
            congregation,
            index === 0 ? 'LOCAL_ADMIN' : 'PUBLISHER',
          ],
        );
        users.push({
          headers: {
            cookie: `cp_session=${session.token}`,
            'x-csrf-token': session.identity.csrfToken,
            'content-type': 'application/json',
          },
        });
      }
      await pool.query(
        "INSERT INTO preaching_point (id,congregation_id,name,capacity,allowed_types) VALUES ($1,$2,'One',1,ARRAY['CART']::equipment_type[]),($3,$2,'Two',2,ARRAY['CART','KIOSK']::equipment_type[])",
        [point, congregation, other],
      );
      await pool.query(
        "INSERT INTO equipment (id,congregation_id,name,type) VALUES ($1,$2,'Cart 1','CART'),($3,$2,'Cart 2','CART')",
        [equipment, congregation, randomUUID()],
      );
      const month = followingMonth(localMonth(new Date(), 'America/Sao_Paulo')),
        date = `${month}-10`;
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
      await pool.query(
        'INSERT INTO point_weekly_hours_day (point_id,day,mode,intervals) VALUES ($1,$2,\'intervals\',\'[{"start":"08:00","end":"18:00"}]\')',
        [point, weekday],
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
        const base = `${await app.getUrl()}/api/congregations/${congregation}`;
        const payload = {
          requestKey: randomUUID(),
          pointId: point,
          date,
          startHour: 8,
          duration: 2,
          equipmentType: 'CART',
          thirdPositionOpen: false,
        };
        const create = (
          body: unknown,
          index = 0,
          headers = users[index]!.headers,
        ) =>
          fetch(`${base}/reservations`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
          });
        expect(
          (
            await fetch(`${base}/reservations`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(payload),
            })
          ).status,
        ).toBe(401);
        expect(
          (
            await create(payload, 0, {
              ...users[0]!.headers,
              'x-csrf-token': '',
            })
          ).status,
        ).toBe(403);
        const repeated = await Promise.all([create(payload), create(payload)]);
        expect(repeated.map((response) => response.status)).toEqual([201, 201]);
        expect((await repeated[0]!.json()).id).toBe(
          (await repeated[1]!.json()).id,
        );
        expect((await create({ ...payload, duration: 1 })).status).toBe(409);
        expect(
          (await create({ ...payload, requestKey: randomUUID() }, 1)).status,
        ).toBe(409);
        expect(
          (
            await create(
              { ...payload, requestKey: randomUUID(), pointId: other },
              1,
            )
          ).status,
        ).toBe(201);
        expect(
          (
            await create(
              { ...payload, requestKey: randomUUID(), pointId: other },
              2,
            )
          ).status,
        ).toBe(409);
        for (const startHour of [10, 12, 14])
          expect(
            (await create({ ...payload, requestKey: randomUUID(), startHour }))
              .status,
          ).toBe(201);
        expect(
          (
            await create({
              ...payload,
              requestKey: randomUUID(),
              startHour: 16,
            })
          ).status,
        ).toBe(409);
        expect(
          (await create({ ...payload, requestKey: randomUUID(), startHour: 7 }))
            .status,
        ).toBe(409);
        expect(
          (
            await create({
              ...payload,
              requestKey: randomUUID(),
              startHour: 8.5,
            })
          ).status,
        ).toBe(400);
        expect(
          (
            await create({
              ...payload,
              requestKey: randomUUID(),
              date: `${month}-32`,
            })
          ).status,
        ).toBe(400);
        expect(
          (
            await create({
              ...payload,
              requestKey: randomUUID(),
              equipmentType: 'KIOSK',
            })
          ).status,
        ).toBe(409);
        expect(
          (
            await create({
              ...payload,
              requestKey: randomUUID(),
              pointId: randomUUID(),
            })
          ).status,
        ).toBe(404);
        expect(
          (
            await fetch(`${base.replace(congregation, foreign)}/reservations`, {
              method: 'POST',
              headers: users[0]!.headers,
              body: JSON.stringify(payload),
            })
          ).status,
        ).toBe(403);
        const midnight = await create(
          {
            ...payload,
            requestKey: randomUUID(),
            pointId: other,
            date: `${month}-11`,
            startHour: 23,
          },
          1,
        );
        expect(midnight.status).toBe(201);
        expect((await midnight.json()).crossesMidnight).toBe(true);
        const update = (path: string, body: unknown, method = 'PUT') =>
          fetch(`${base}/${path}`, {
            method,
            headers: users[0]!.headers,
            body: JSON.stringify(body),
          });
        expect(
          (
            await update(
              `equipment/${equipment}/state`,
              { active: false },
              'PATCH',
            )
          ).status,
        ).toBe(409);
        expect(
          (
            await update(`points/${other}`, {
              name: 'Two',
              capacity: 2,
              allowedTypes: ['KIOSK'],
            })
          ).status,
        ).toBe(409);
        const weekly = await (
          await fetch(`${base}/points/${point}/weekly-hours`, {
            headers: users[0]!.headers,
          })
        ).json();
        expect(
          (
            await update(`points/${point}/weekly-hours`, {
              ...weekly,
              timezone: 'America/Manaus',
            })
          ).status,
        ).toBe(409);
        weekly.days[weekday] = { day: weekday, mode: 'closed', intervals: [] };
        expect(
          (await update(`points/${point}/weekly-hours`, weekly)).status,
        ).toBe(409);
        expect(
          (
            await fetch(`${base}/schedule/${month}/finalize`, {
              method: 'POST',
              headers: users[0]!.headers,
            })
          ).status,
        ).toBe(201);
        expect(
          (
            await create(
              { ...payload, requestKey: randomUUID(), date: `${month}-12` },
              1,
            )
          ).status,
        ).toBe(409);
        expect(
          (
            await fetch(`${base}/schedule/${month}/reopen`, {
              method: 'POST',
              headers: users[0]!.headers,
            })
          ).status,
        ).toBe(201);
        expect(
          (
            await create(
              { ...payload, requestKey: randomUUID(), date: `${month}-12` },
              1,
            )
          ).status,
        ).toBe(409);
        const schedule = await (
          await fetch(`${base}/schedule`, { headers: users[0]!.headers })
        ).json();
        expect(schedule.reservations).toHaveLength(6);
        expect(
          (await pool.query('SELECT count(*) FROM reservation')).rows[0].count,
        ).toBe('6');
        expect(() => localInstant('2027-03-14', 2, 'America/New_York')).toThrow(
          'inexistente ou ambíguo',
        );
        expect(() => localInstant('2027-11-07', 1, 'America/New_York')).toThrow(
          'inexistente ou ambíguo',
        );
      } finally {
        await app.close();
      }
    });
  }, 120_000);
});
