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
import {
  RecurrenceService,
  weeklyDates,
} from '../../../apps/api/src/recurrence.service.js';
import { runPrisma, withDisposableDatabase } from './test-support/database.js';
const { Test } = createRequire(
  new URL('../../../apps/api/package.json', import.meta.url),
)('@nestjs/testing');

describe('weekly recurrence HTTP and PostgreSQL', () => {
  it('generates all weekly dates once, persists unavailable occurrences for explicit retry, respects finalized months, eligibility and stopping across month rollovers', async () => {
    await withDisposableDatabase(async (url, pool) => {
      expect(runPrisma(url, ['migrate', 'deploy'])).toBe(0);
      const sessions = new MemorySessionStore(),
        repository = new PgIdentityRepository(pool);
      const congregation = randomUUID(),
        foreign = randomUUID(),
        point = randomUUID();
      await pool.query(
        "INSERT INTO congregation (id,name) VALUES ($1,'Series test'),($2,'Foreign test')",
        [congregation, foreign],
      );
      const users: { accountId: string; headers: Record<string, string> }[] =
        [];
      for (let index = 0; index < 3; index++) {
        const session = sessions.create({
          issuer: 'https://example.test/',
          subject: `series-${index}`,
          email: `series-${index}@example.test`,
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
          accountId: account.accountId,
          headers: {
            cookie: `cp_session=${session.token}`,
            'x-csrf-token': session.identity.csrfToken,
            'content-type': 'application/json',
          },
        });
      }
      await pool.query(
        "INSERT INTO preaching_point (id,congregation_id,name,allowed_types) VALUES ($1,$2,'Series point',ARRAY['CART']::equipment_type[])",
        [point, congregation],
      );
      await pool.query(
        "INSERT INTO equipment (id,congregation_id,name,type) VALUES ($1,$2,'Series cart','CART')",
        [randomUUID(), congregation],
      );
      const month = followingMonth(localMonth(new Date(), 'America/Sao_Paulo')),
        date = `${month}-01`,
        weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
      const dates = weeklyDates(month, weekday),
        conflictDate = dates[1]!;
      await pool.query(
        'INSERT INTO point_weekly_hours_day (point_id,day,mode,intervals) VALUES ($1,$2,\'intervals\',\'[{"start":"08:00","end":"08:30"},{"start":"08:30","end":"20:00"}]\')',
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
        const post = (path: string, index = 1, body?: unknown) =>
          fetch(`${base}/${path}`, {
            method: 'POST',
            headers: users[index]!.headers,
            ...(body ? { body: JSON.stringify(body) } : {}),
          });
        const payload = {
          requestKey: randomUUID(),
          pointId: point,
          date,
          startHour: 8,
          duration: 2,
          equipmentType: 'CART',
          thirdPositionOpen: true,
        };
        const source = await (await post('reservations', 1, payload)).json();
        const competing = await Promise.all([
          post('reservations', 0, {
            ...payload,
            requestKey: randomUUID(),
            date: `${month}-03`,
            startHour: 18,
          }),
          post('reservations', 2, {
            ...payload,
            requestKey: randomUUID(),
            date: `${month}-03`,
            startHour: 18,
          }),
        ]);
        expect(competing.map((response) => response.status).sort()).toEqual([
          201, 409,
        ]);
        expect(
          (
            await post('reservations', 2, {
              ...payload,
              requestKey: randomUUID(),
              date: conflictDate,
            })
          ).status,
        ).toBe(201);
        const path = `reservations/${source.id}/recurrence`;
        // A reservation in another congregation may cross local midnight at :30.
        // Daily limits must split actual minutes rather than assign whole hours.
        const nightPoint = randomUUID(),
          foreignPoint = randomUUID();
        await pool.query(
          "UPDATE congregation SET timezone='Asia/Kolkata' WHERE id=$1",
          [foreign],
        );
        await pool.query(
          "INSERT INTO membership (id,account_id,congregation_id,role) VALUES ($1,$2,$3,'LOCAL_ADMIN')",
          [randomUUID(), users[0]!.accountId, foreign],
        );
        await pool.query(
          "INSERT INTO preaching_point (id,congregation_id,name,allowed_types) VALUES ($1,$2,'Night point',ARRAY['CART']::equipment_type[]),($3,$4,'Offset point',ARRAY['CART']::equipment_type[])",
          [nightPoint, congregation, foreignPoint, foreign],
        );
        await pool.query(
          "INSERT INTO equipment (id,congregation_id,name,type) VALUES ($1,$2,'Offset cart','CART')",
          [randomUUID(), foreign],
        );
        const foreignBooking = await fetch(
          `${base.replace(congregation, foreign)}/reservations`,
          {
            method: 'POST',
            headers: users[0]!.headers,
            body: JSON.stringify({
              ...payload,
              requestKey: randomUUID(),
              pointId: foreignPoint,
              date: `${month}-15`,
            }),
          },
        );
        expect(foreignBooking.status).toBe(201);
        for (const startHour of [2, 4, 6])
          expect(
            (
              await post('reservations', 0, {
                ...payload,
                requestKey: randomUUID(),
                pointId: nightPoint,
                date: `${month}-15`,
                startHour,
              })
            ).status,
          ).toBe(201);
        expect(
          (
            await post('reservations', 0, {
              ...payload,
              requestKey: randomUUID(),
              pointId: nightPoint,
              date: `${month}-15`,
              startHour: 10,
              duration: 1,
            })
          ).status,
        ).toBe(409);
        expect((await post(path, 2)).status).toBe(403);
        expect(
          (
            await fetch(`${base}/${path}`, {
              method: 'POST',
              headers: { ...users[1]!.headers, 'x-csrf-token': '' },
            })
          ).status,
        ).toBe(403);
        const activated = await post(path);
        expect(activated.status).toBe(201);
        const result = await activated.json();
        expect(result.generated).toBe(dates.length - 2);
        expect(result.conflicts).toEqual([
          {
            date: conflictDate,
            message: expect.stringContaining('indisponível'),
          },
        ]);
        const seriesId = result.id;
        const repeated = await (await post(path)).json();
        expect(repeated.id).toBe(seriesId);
        expect(repeated.generated).toBe(0);
        const worker = new RecurrenceService(pool);
        await Promise.all([worker.generateAll(), worker.generateAll()]);
        expect(
          (await pool.query('SELECT * FROM reservation_series')).rowCount,
        ).toBe(1);
        expect(
          (
            await pool.query(
              'SELECT * FROM recurrence_occurrence WHERE series_id=$1',
              [seriesId],
            )
          ).rowCount,
        ).toBe(dates.length);
        expect(
          (
            await pool.query(
              'SELECT * FROM reservation WHERE responsible_account_id=$1',
              [users[1]!.accountId],
            )
          ).rowCount,
        ).toBe(dates.length - 1);
        expect(
          (await post(`recurrences/${seriesId}/retry/${conflictDate}`, 2))
            .status,
        ).toBe(403);
        expect(
          (await post(`recurrences/${seriesId}/retry/${conflictDate}`)).status,
        ).toBe(201);
        expect(
          (
            await pool.query(
              'SELECT reservation_id FROM recurrence_occurrence WHERE series_id=$1 AND local_date=$2',
              [seriesId, conflictDate],
            )
          ).rows[0].reservation_id,
        ).toBeNull();
        // Resolve resource availability, without silently retrying the failed occurrence.
        await pool.query('UPDATE preaching_point SET capacity=2 WHERE id=$1', [
          point,
        ]);
        await pool.query(
          "INSERT INTO equipment (id,congregation_id,name,type) VALUES ($1,$2,'Second cart','CART')",
          [randomUUID(), congregation],
        );
        await worker.generateAll();
        expect(
          (
            await pool.query(
              'SELECT reservation_id FROM recurrence_occurrence WHERE series_id=$1 AND local_date=$2',
              [seriesId, conflictDate],
            )
          ).rows[0].reservation_id,
        ).toBeNull();
        const retry = await (
          await post(`recurrences/${seriesId}/retry/${conflictDate}`)
        ).json();
        expect(retry.generated).toBe(1);
        expect(retry.conflicts).toEqual([]);
        const attempts = (
          await pool.query(
            'SELECT attempts FROM recurrence_occurrence WHERE series_id=$1 AND local_date=$2',
            [seriesId, conflictDate],
          )
        ).rows[0].attempts;
        expect(attempts).toHaveLength(3);
        expect(attempts[0].error).toContain('indisponível');
        expect(attempts[2]).toMatchObject({
          actorAccountId: users[1]!.accountId,
          error: null,
          reservationId: expect.any(String),
        });
        const schedule = await (
          await fetch(`${base}/schedule`, { headers: users[1]!.headers })
        ).json();
        expect(schedule.recurrences[0]).toMatchObject({
          id: seriesId,
          conflicts: [],
          isResponsible: true,
        });
        expect(
          schedule.reservations.filter(
            (item: { isResponsible: boolean }) => item.isResponsible,
          ),
        ).toHaveLength(dates.length);
        const hidden = await (
          await fetch(`${base}/schedule`, { headers: users[2]!.headers })
        ).json();
        expect(hidden.recurrences).toEqual([]);
        expect(
          (
            await fetch(
              `${base.replace(congregation, foreign)}/recurrences/${seriesId}/stop`,
              { method: 'POST', headers: users[1]!.headers },
            )
          ).status,
        ).toBe(403);
        const upcoming = followingMonth(month),
          futureDates = weeklyDates(upcoming, weekday);
        await pool.query(
          "INSERT INTO schedule_month (congregation_id,month,state) VALUES ($1,$2,'finalized')",
          [congregation, upcoming],
        );
        const rolling = new RecurrenceService(
          pool,
          () => new Date(`${month}-01T12:00:00Z`),
        );
        await rolling.generateAll();
        const blocked = await pool.query(
          'SELECT * FROM recurrence_occurrence WHERE series_id=$1 AND substring(local_date,1,7)=$2',
          [seriesId, upcoming],
        );
        expect(blocked.rows).toHaveLength(futureDates.length);
        expect(
          blocked.rows.every(
            (row) =>
              row.reservation_id === null && row.error.includes('bloqueado'),
          ),
        ).toBe(true);
        await pool.query(
          "UPDATE schedule_month SET state='reopened' WHERE congregation_id=$1 AND month=$2",
          [congregation, upcoming],
        );
        const pub = await rolling.generate(seriesId, congregation, {
          accountId: users[1]!.accountId,
          retryDate: futureDates[0],
        });
        expect(pub.generated).toBe(0);
        const admin = await rolling.generate(seriesId, congregation, {
          accountId: users[0]!.accountId,
          retryDate: futureDates[0],
        });
        expect(admin.generated).toBe(1);
        await pool.query(
          "UPDATE membership SET status='REVOKED',revoked_at=now() WHERE account_id=$1",
          [users[1]!.accountId],
        );
        const revoked = await rolling.generate(seriesId, congregation, {
          accountId: users[0]!.accountId,
          retryDate: futureDates[1],
        });
        expect(revoked.generated).toBe(0);
        expect(revoked.conflicts[0]!.message).toContain('vínculo ativo');
        const count = (await pool.query('SELECT count(*) FROM reservation'))
          .rows[0].count;
        expect((await post(`recurrences/${seriesId}/stop`, 2)).status).toBe(
          403,
        );
        expect((await post(`recurrences/${seriesId}/stop`, 0)).status).toBe(
          201,
        );
        expect((await post(`recurrences/${seriesId}/stop`, 0)).status).toBe(
          201,
        );
        const later = new RecurrenceService(
          pool,
          () => new Date(`${upcoming}-01T12:00:00Z`),
        );
        await later.generateAll();
        expect(
          (await pool.query('SELECT count(*) FROM reservation')).rows[0].count,
        ).toBe(count);
        expect(
          (
            await pool.query(
              'SELECT stopped_by_account_id FROM reservation_series WHERE id=$1',
              [seriesId],
            )
          ).rows[0].stopped_by_account_id,
        ).toBe(users[0]!.accountId);
        expect(weeklyDates('2027-02', 2)).toEqual([
          '2027-02-02',
          '2027-02-09',
          '2027-02-16',
          '2027-02-23',
        ]);
        expect(weeklyDates('2027-03', 2)).toHaveLength(5);
        // At the end of the visible window, wait until both months are available.
        const lastDate = new Date(
          Date.parse(`${upcoming}-01T00:00:00Z`) - 86400000,
        )
          .toISOString()
          .slice(0, 10);
        const lastWeekday = new Date(`${lastDate}T12:00:00Z`).getUTCDay();
        const nightSource = await (
          await post('reservations', 2, {
            ...payload,
            requestKey: randomUUID(),
            pointId: nightPoint,
            date: weeklyDates(month, lastWeekday)[0],
            startHour: 23,
          })
        ).json();
        const nightSeries = await (
          await post(`reservations/${nightSource.id}/recurrence`, 2)
        ).json();
        expect(nightSeries.id).toEqual(expect.any(String));
        expect(
          (
            await pool.query(
              'SELECT * FROM recurrence_occurrence WHERE series_id=$1 AND local_date=$2',
              [nightSeries.id, lastDate],
            )
          ).rowCount,
        ).toBe(0);
        await rolling.generateAll();
        const lastOccurrence = (
          await pool.query(
            'SELECT * FROM recurrence_occurrence WHERE series_id=$1 AND local_date=$2',
            [nightSeries.id, lastDate],
          )
        ).rows[0];
        expect(lastOccurrence.reservation_id).toBeNull();
        expect(lastOccurrence.error).toContain('bloqueado');
        expect(
          (
            await rolling.generate(nightSeries.id, congregation, {
              accountId: users[0]!.accountId,
              retryDate: lastDate,
            })
          ).generated,
        ).toBe(1);
      } finally {
        await app.close();
      }
    });
  }, 120_000);
});
