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
import { ReservationsService } from '../../../apps/api/src/reservations.service.js';
import { localInstant } from '../../../apps/api/src/reservation-time.js';
import { runPrisma, withDisposableDatabase } from './test-support/database.js';
const { Test } = createRequire(
  new URL('../../../apps/api/package.json', import.meta.url),
)('@nestjs/testing');

describe('open positions HTTP and PostgreSQL', () => {
  it('admits only self, serializes last-position races, counts full and late participation and preserves monthly locks and responsible-only recurrence', async () => {
    await withDisposableDatabase(async (url, pool) => {
      expect(runPrisma(url, ['migrate', 'deploy'])).toBe(0);
      const sessions = new MemorySessionStore(),
        repository = new PgIdentityRepository(pool);
      const congregation = randomUUID(),
        foreign = randomUUID(),
        point = randomUUID();
      await pool.query(
        "INSERT INTO congregation (id,name) VALUES ($1,'Positions test'),($2,'Foreign positions')",
        [congregation, foreign],
      );
      const users: { accountId: string; headers: Record<string, string> }[] =
        [];
      for (let index = 0; index < 8; index++) {
        const session = sessions.create({
          issuer: 'https://example.test/',
          subject: `positions-${index}`,
          email: `positions-${index}@example.test`,
          emailVerified: index !== 5,
        });
        const account = await repository.syncExternalAccount(session.identity);
        await pool.query(
          'INSERT INTO membership (id,account_id,congregation_id,role) VALUES ($1,$2,$3,$4)',
          [
            randomUUID(),
            account.accountId,
            index === 4 ? foreign : congregation,
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
        "INSERT INTO preaching_point (id,congregation_id,name,allowed_types) VALUES ($1,$2,'Positions point',ARRAY['CART']::equipment_type[])",
        [point, congregation],
      );
      await pool.query(
        "INSERT INTO equipment (id,congregation_id,name,type) VALUES ($1,$2,'Positions cart','CART')",
        [randomUUID(), congregation],
      );
      const month = followingMonth(localMonth(new Date(), 'America/Sao_Paulo')),
        date = `${month}-10`;
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
        const post = (path: string, index = 0, body?: unknown) =>
          fetch(`${base}/${path}`, {
            method: 'POST',
            headers: users[index]!.headers,
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
          });
        const book = async (
          startHour: number,
          index = 0,
          extra: Record<string, unknown> = {},
        ) => {
          const response = await post('reservations', index, {
            requestKey: randomUUID(),
            pointId: point,
            date,
            startHour,
            duration: 2,
            equipmentType: 'CART',
            thirdPositionOpen: true,
            ...extra,
          });
          expect(response.status).toBe(201);
          return (await response.json()) as { id: string };
        };
        const first = await book(8, 0, { thirdPositionOpen: false });
        const join = (id: string, index: number) =>
          post(`reservations/${id}/join`, index);
        expect(
          (
            await fetch(`${base}/reservations/${first.id}/join`, {
              method: 'POST',
            })
          ).status,
        ).toBe(401);
        expect(
          (
            await fetch(`${base}/reservations/${first.id}/join`, {
              method: 'POST',
              headers: { ...users[1]!.headers, 'x-csrf-token': '' },
            })
          ).status,
        ).toBe(403);
        expect((await join(first.id, 4)).status).toBe(403);
        expect((await join(first.id, 5)).status).toBe(403);
        expect(
          (
            await post(`reservations/${first.id}/join`, 1, {
              accountId: users[2]!.accountId,
            })
          ).status,
        ).toBe(400);
        expect(
          (
            await fetch(
              `${base.replace(congregation, foreign)}/reservations/${first.id}/join`,
              { method: 'POST', headers: users[4]!.headers },
            )
          ).status,
        ).toBe(404);
        expect((await join(randomUUID(), 1)).status).toBe(404);
        const admission = await join(first.id, 1);
        expect(admission.status).toBe(201);
        const initial = await admission.json();
        expect(initial).toMatchObject({ position: 2, confirmedCount: 2 });
        expect(await (await join(first.id, 1)).json()).toEqual(initial);
        expect((await join(first.id, 2)).status).toBe(409);
        const second = await book(10);
        expect((await join(second.id, 1)).status).toBe(201);
        const race = await Promise.all([
          join(second.id, 2),
          join(second.id, 3),
        ]);
        expect(race.map((response) => response.status).sort()).toEqual([
          201, 409,
        ]);
        expect((await (await join(second.id, 0)).json()).position).toBe(1);
        expect(
          (
            await pool.query(
              'SELECT * FROM reservation_participation WHERE reservation_id=$1',
              [second.id],
            )
          ).rowCount,
        ).toBe(2);
        // Joining does not consume another equipment or point capacity unit.
        expect(
          (await pool.query('SELECT count(*) FROM equipment WHERE active'))
            .rows[0].count,
        ).toBe('1');
        await pool.query('UPDATE preaching_point SET capacity=2 WHERE id=$1', [
          point,
        ]);
        await pool.query(
          "INSERT INTO equipment (id,congregation_id,name,type) VALUES ($1,$2,'Second positions cart','CART')",
          [randomUUID(), congregation],
        );
        const overlapping = await book(9, 6);
        expect((await join(overlapping.id, 1)).status).toBe(409);
        expect(
          (
            await post('reservations', 1, {
              requestKey: randomUUID(),
              pointId: point,
              date,
              startHour: 9,
              duration: 1,
              equipmentType: 'CART',
              thirdPositionOpen: true,
            })
          ).status,
        ).toBe(409);
        for (const start of [12, 14]) {
          const reservation = await book(start);
          expect((await join(reservation.id, 1)).status).toBe(201);
        }
        const excess = await book(16, 6, { duration: 1 });
        expect((await join(excess.id, 1)).status).toBe(409);
        const snapshot = await (
          await fetch(`${base}/schedule`, { headers: users[1]!.headers })
        ).json();
        expect(snapshot.serverNow).toEqual(expect.any(String));
        expect(
          snapshot.reservations.find((r: { id: string }) => r.id === first.id),
        ).toMatchObject({
          confirmedCount: 2,
          openPositions: 0,
          isParticipant: true,
          canJoin: false,
        });
        expect(
          snapshot.reservations.find((r: { id: string }) => r.id === second.id),
        ).toMatchObject({ confirmedCount: 3, openPositions: 0 });
        const stranger = await (
          await fetch(`${base}/schedule`, { headers: users[3]!.headers })
        ).json();
        expect(
          stranger.reservations.find((r: { id: string }) => r.id === excess.id),
        ).toMatchObject({ confirmedCount: 1, openPositions: 2, canJoin: true });
        const ownSource = await book(8, 1, { date: `${month}-11` });
        const nextDate = new Date(
          Date.parse(`${month}-11T12:00:00Z`) + 7 * 86400000,
        )
          .toISOString()
          .slice(0, 10);
        const joinedFuture = await book(8, 6, { date: nextDate });
        expect((await join(joinedFuture.id, 1)).status).toBe(201);
        const ownSeries = await (
          await post(`reservations/${ownSource.id}/recurrence`, 1)
        ).json();
        expect(ownSeries.conflicts).toContainEqual({
          date: nextDate,
          message: expect.stringContaining('participante'),
        });
        const responsibleSeries = await (
          await post(`reservations/${first.id}/recurrence`)
        ).json();
        expect(responsibleSeries.id).toEqual(expect.any(String));
        expect(
          (
            await pool.query(
              'SELECT count(*) FROM reservation_participation p JOIN recurrence_occurrence o ON o.reservation_id=p.reservation_id WHERE o.series_id=$1 AND o.reservation_id<>$2',
              [responsibleSeries.id, first.id],
            )
          ).rows[0].count,
        ).toBe('0');
        const lateDate = `${month}-20`;
        for (const hour of [0, 2, 4]) await book(hour, 7, { date: lateDate });
        const late = await book(8, 6, { date: lateDate });
        // Half an hour after the original start, only the remaining 90 minutes count.
        const lateNow = new Date(
          localInstant(lateDate, 8, 'America/Sao_Paulo').getTime() + 30 * 60000,
        );
        const lateResult = await new ReservationsService(
          pool,
          () => lateNow,
        ).join(users[7]!.accountId, congregation, late.id);
        expect(new Date(lateResult.startsAt)).toEqual(lateNow);
        const finalHalf = await book(10, 6, { date: lateDate, duration: 1 });
        const halfNow = new Date(
          localInstant(lateDate, 10, 'America/Sao_Paulo').getTime() +
            30 * 60000,
        );
        await expect(
          new ReservationsService(pool, () => halfNow).join(
            users[7]!.accountId,
            congregation,
            finalHalf.id,
          ),
        ).resolves.toMatchObject({ position: 2 });
        const over = await book(11, 6, { date: lateDate, duration: 1 });
        await expect(
          new ReservationsService(pool, () =>
            localInstant(lateDate, 11, 'America/Sao_Paulo'),
          ).join(users[7]!.accountId, congregation, over.id),
        ).rejects.toMatchObject({ status: 409 });
        await expect(
          new ReservationsService(pool, () =>
            localInstant(lateDate, 11, 'America/Sao_Paulo'),
          ).join(users[3]!.accountId, congregation, finalHalf.id),
        ).rejects.toMatchObject({ status: 409 });
        const overnight = await book(23, 6, { date: `${month}-21` });
        const overnightNow = new Date(
          localInstant(`${month}-21`, 23, 'America/Sao_Paulo').getTime() +
            30 * 60000,
        );
        await expect(
          new ReservationsService(pool, () => overnightNow).join(
            users[7]!.accountId,
            congregation,
            overnight.id,
          ),
        ).resolves.toMatchObject({ position: 2 });
        const cancelled = await book(12, 6, { date: `${month}-23` });
        await pool.query(
          'UPDATE reservation SET cancelled_at=now() WHERE id=$1',
          [cancelled.id],
        );
        expect((await join(cancelled.id, 3)).status).toBe(409);
        expect((await post(`schedule/${month}/finalize`)).status).toBe(201);
        expect((await join(excess.id, 3)).status).toBe(409);
        expect((await post(`schedule/${month}/reopen`)).status).toBe(201);
        expect((await join(excess.id, 3)).status).toBe(409);
        expect((await join(excess.id, 0)).status).toBe(409);
        await pool.query(
          "UPDATE membership SET status='REVOKED',revoked_at=now() WHERE account_id=$1",
          [users[3]!.accountId],
        );
        expect((await join(excess.id, 3)).status).toBe(403);
        await expect(
          pool.query(
            'INSERT INTO reservation_participation (reservation_id,account_id,position,joined_at,starts_at) VALUES ($1,$2,4,now(),now())',
            [first.id, users[2]!.accountId],
          ),
        ).rejects.toMatchObject({ code: '23514' });
      } finally {
        await app.close();
      }
    });
  }, 120_000);
});
