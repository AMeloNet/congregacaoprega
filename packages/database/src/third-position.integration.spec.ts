import { runPrisma, withDisposableDatabase } from './test-support/database.js';
import { reservationApp } from './test-support/reservation-app.js';

describe('third position management', () => {
  it('authorizes vacant-position changes, preserves weekly templates and serializes blocking against joining with history and monthly locks', async () => {
    await withDisposableDatabase(async (url, pool) => {
      expect(runPrisma(url, ['migrate', 'deploy'])).toBe(0);
      const f = await reservationApp(pool);
      try {
        const reservation = await f.book();
        const path = `reservations/${reservation.id}/third-position`;
        expect((await f.request(path, 2, { open: false }, 'PUT')).status).toBe(
          403,
        );
        expect((await f.request(path, 5, { open: false }, 'PUT')).status).toBe(
          403,
        );
        expect((await f.request(path, 6, { open: false }, 'PUT')).status).toBe(
          403,
        );
        expect((await f.request(path, 1, { open: 'no' }, 'PUT')).status).toBe(
          400,
        );
        expect(
          (
            await f.request(
              path,
              1,
              { open: false, accountId: f.users[2]!.accountId },
              'PUT',
            )
          ).status,
        ).toBe(400);
        expect(
          (
            await fetch(`${f.base}/${path}`, {
              method: 'PUT',
              headers: { ...f.users[1]!.headers, 'x-csrf-token': '' },
              body: JSON.stringify({ open: false }),
            })
          ).status,
        ).toBe(403);
        const series = await (
          await f.request(`reservations/${reservation.id}/recurrence`, 1)
        ).json();
        expect(series.id).toEqual(expect.any(String));
        expect((await f.request(path, 1, { open: false }, 'PUT')).status).toBe(
          200,
        );
        expect((await f.request(path, 1, { open: false }, 'PUT')).status).toBe(
          200,
        );
        expect(
          (
            await pool.query(
              'SELECT * FROM reservation_history WHERE reservation_id=$1',
              [reservation.id],
            )
          ).rowCount,
        ).toBe(1);
        expect(
          (
            await pool.query(
              'SELECT configuration FROM reservation_series WHERE id=$1',
              [series.id],
            )
          ).rows[0].configuration.third_position_open,
        ).toBe(true);
        expect(
          (await f.request(`reservations/${reservation.id}/join`, 2)).status,
        ).toBe(201);
        expect(
          (await f.request(`reservations/${reservation.id}/join`, 3)).status,
        ).toBe(409);
        expect((await f.request(path, 1, { open: true }, 'PUT')).status).toBe(
          200,
        );
        const race = await Promise.all([
          f.request(path, 1, { open: false }, 'PUT'),
          f.request(`reservations/${reservation.id}/join`, 3),
        ]);
        expect(race.map((r) => r.status)).toContain(409);
        const stored = (
          await pool.query(
            'SELECT third_position_open FROM reservation WHERE id=$1',
            [reservation.id],
          )
        ).rows[0];
        const third = (
          await pool.query(
            'SELECT 1 FROM reservation_participation WHERE reservation_id=$1 AND position=3',
            [reservation.id],
          )
        ).rowCount;
        expect(!stored.third_position_open && third === 1).toBe(false);
        if (third)
          expect(
            (await f.request(path, 0, { open: false }, 'PUT')).status,
          ).toBe(409);
        expect((await f.request(`schedule/${f.month}/finalize`)).status).toBe(
          201,
        );
        expect((await f.request(path, 1, { open: true }, 'PUT')).status).toBe(
          409,
        );
        expect((await f.request(path, 0, { open: true }, 'PUT')).status).toBe(
          409,
        );
        expect((await f.request(`schedule/${f.month}/reopen`)).status).toBe(
          201,
        );
        expect((await f.request(path, 1, { open: true }, 'PUT')).status).toBe(
          409,
        );
        expect((await f.request(path, 0, { open: true }, 'PUT')).status).toBe(
          200,
        );
      } finally {
        await f.app.close();
      }
    });
  }, 120_000);
});
