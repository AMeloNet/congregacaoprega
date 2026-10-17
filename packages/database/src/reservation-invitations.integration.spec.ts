import { randomUUID } from 'node:crypto';
import { runPrisma, withDisposableDatabase } from './test-support/database.js';
import { reservationApp } from './test-support/reservation-app.js';
import { ReservationInvitationsService } from '../../../apps/api/src/reservation-invitations.service.js';
import { ReservationsService } from '../../../apps/api/src/reservations.service.js';
import { localInstant } from '../../../apps/api/src/reservation-time.js';

describe('reservation invitations', () => {
  it('reserves positions, validates recipient and agenda, supersedes resends, declines competing invitations and handles expiry, late acceptance, concurrency and monthly locks', async () => {
    await withDisposableDatabase(async (url, pool) => {
      expect(runPrisma(url, ['migrate', 'deploy'])).toBe(0);
      const f = await reservationApp(pool);
      try {
        const r = await f.book(1, { thirdPositionOpen: false });
        const send = (
          recipient: number,
          key = randomUUID(),
          reservation = r.id,
          owner = 1,
        ) =>
          f.request(`reservations/${reservation}/invitations`, owner, {
            requestKey: key,
            recipientEmail: `management-${recipient}@example.test`,
          });
        expect((await send(2, randomUUID(), r.id, 3)).status).toBe(403);
        expect((await send(5)).status).toBe(404);
        expect((await send(6)).status).toBe(404);
        const key = randomUUID(),
          firstResponse = await send(2, key);
        expect(firstResponse.status).toBe(201);
        const first = await firstResponse.json();
        expect((await (await send(2, key)).json()).id).toBe(first.id);
        expect((await send(3, key)).status).toBe(409);
        const thirdResponse = await send(3);
        expect(thirdResponse.status).toBe(201);
        const third = await thirdResponse.json();
        expect(third.position).toBe(3);
        expect((await f.request(`reservations/${r.id}/join`, 4)).status).toBe(
          409,
        );
        expect(
          (
            await f.request(
              `reservations/${r.id}/third-position`,
              1,
              { open: true },
              'PUT',
            )
          ).status,
        ).toBe(409);
        const snapshot = await (
          await f.request('schedule', 1, undefined, 'GET')
        ).json();
        expect(snapshot.reservations[0]).toMatchObject({
          confirmedCount: 1,
          pendingCount: 2,
          openPositions: 0,
          thirdPositionVacant: false,
        });
        expect(
          (await f.request(`reservation-invitations/${first.id}/accept`, 3))
            .status,
        ).toBe(403);
        const inbox = await (
          await f.request('reservation-inbox', 2, undefined, 'GET')
        ).json();
        expect(inbox.invitations.map((i: { id: string }) => i.id)).toEqual([
          first.id,
        ]);
        expect(
          (await f.request(`reservation-invitations/${first.id}/accept`, 5))
            .status,
        ).toBe(403);
        const replacement = await (
          await f.request(`reservation-invitations/${third.id}/resend`, 1)
        ).json();
        expect(replacement.id).not.toBe(third.id);
        expect(
          (
            await (
              await f.request(`reservation-invitations/${third.id}/resend`, 1)
            ).json()
          ).id,
        ).toBe(replacement.id);
        expect(
          (await f.request(`reservation-invitations/${third.id}/accept`, 3))
            .status,
        ).toBe(409);
        expect(
          (
            await f.request(
              `reservation-invitations/${replacement.id}/revoke`,
              1,
            )
          ).status,
        ).toBe(201);
        await pool.query('UPDATE preaching_point SET capacity=2 WHERE id=$1', [
          f.point,
        ]);
        await pool.query(
          "INSERT INTO equipment (id,congregation_id,name,type) VALUES ($1,$2,'Second invite cart','CART')",
          [randomUUID(), f.congregation],
        );
        const other = await f.book(4),
          competing = await (await send(2, randomUUID(), other.id, 4)).json();
        expect(
          (await f.request(`reservation-invitations/${first.id}/accept`, 2))
            .status,
        ).toBe(201);
        expect(
          (await f.request(`reservation-invitations/${first.id}/accept`, 2))
            .status,
        ).toBe(201);
        expect(
          (
            await pool.query(
              'SELECT state FROM reservation_invitation WHERE id=$1',
              [competing.id],
            )
          ).rows[0].state,
        ).toBe('declined');
        expect(
          (
            await pool.query(
              'SELECT count(*) FROM reservation_participation WHERE reservation_id=$1',
              [r.id],
            )
          ).rows[0].count,
        ).toBe('1');
        const renewed = await (await send(3)).json();
        expect(renewed.position).toBe(3);
        const raced = await Promise.all([
          f.request(`reservation-invitations/${renewed.id}/accept`, 3),
          f.request(`reservation-invitations/${renewed.id}/revoke`, 1),
        ]);
        expect(raced.some((response) => response.status === 201)).toBe(true);
        expect(
          (
            await pool.query(
              'SELECT count(*) FROM reservation_participation WHERE reservation_id=$1',
              [r.id],
            )
          ).rows[0].count,
        ).toMatch(/^[12]$/);
        const expiry = await f.book(1, { date: `${f.month}-11` }),
          created = await (await send(3, randomUUID(), expiry.id)).json();
        const createdAt = new Date(
          (
            await pool.query(
              'SELECT created_at FROM reservation_invitation WHERE id=$1',
              [created.id],
            )
          ).rows[0].created_at,
        );
        const afterDay = new Date(createdAt.getTime() + 24 * 3600000);
        // No expiry worker ran: admission frees the stale pending position itself.
        await expect(
          new ReservationsService(pool, () => afterDay).join(
            f.users[4]!.accountId,
            f.congregation,
            expiry.id,
          ),
        ).resolves.toMatchObject({ position: 2 });
        await expect(
          new ReservationInvitationsService(pool, () => afterDay).act(
            f.users[3]!.accountId,
            f.congregation,
            created.id,
            'accept',
          ),
        ).rejects.toMatchObject({ status: 409 });
        const late = await f.book(1, { date: `${f.month}-12` });
        const start = localInstant(`${f.month}-12`, 8, 'America/Sao_Paulo');
        const lateNow = new Date(start.getTime() + 30 * 60000);
        const lateService = new ReservationInvitationsService(
          pool,
          () => lateNow,
        );
        const lateInvite = await lateService.send(
          f.users[1]!.accountId,
          f.congregation,
          late.id,
          {
            requestKey: randomUUID(),
            recipientEmail: 'management-3@example.test',
          },
        );
        expect(new Date(lateInvite.expiresAt)).toEqual(
          new Date(start.getTime() + 2 * 3600000),
        );
        expect(
          await lateService.act(
            f.users[3]!.accountId,
            f.congregation,
            lateInvite.id,
            'accept',
          ),
        ).toMatchObject({ startsAt: lateNow, position: 2 });
        expect((await f.request(`schedule/${f.month}/finalize`)).status).toBe(
          201,
        );
        expect((await send(4, randomUUID(), expiry.id)).status).toBe(409);
        expect((await f.request(`schedule/${f.month}/reopen`)).status).toBe(
          201,
        );
        expect((await send(4, randomUUID(), expiry.id)).status).toBe(409);
        const adminInvite = await send(3, randomUUID(), other.id, 0);
        expect(adminInvite.status).toBe(201);
        expect(
          (
            await f.request(
              `reservation-invitations/${(await adminInvite.json()).id}/accept`,
              3,
            )
          ).status,
        ).toBe(409);
      } finally {
        await f.app.close();
      }
    });
  }, 120_000);
});
