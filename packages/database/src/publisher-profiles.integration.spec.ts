import { runPrisma, withDisposableDatabase } from './test-support/database.js';
import { reservationApp } from './test-support/reservation-app.js';
describe('publisher display names', () => {
  it('allows self or local admin to maintain a congregation-specific name with history and keeps the email directory restricted', async () => {
    await withDisposableDatabase(async (url, pool) => {
      expect(runPrisma(url, ['migrate', 'deploy'])).toBe(0);
      const f = await reservationApp(pool);
      try {
        expect(
          (await f.request('reservation-publishers', 1, undefined, 'GET'))
            .status,
        ).toBe(403);
        expect(
          (
            await f.request(
              'publisher-profile',
              1,
              { displayName: '  Publicador de Teste  ' },
              'PUT',
            )
          ).status,
        ).toBe(200);
        expect(
          (
            await (
              await f.request('publisher-profile', 1, undefined, 'GET')
            ).json()
          ).displayName,
        ).toBe('Publicador de Teste');
        expect(
          (
            await f.request(
              `publishers/${f.users[2]!.accountId}/name`,
              1,
              { displayName: 'Outro' },
              'PUT',
            )
          ).status,
        ).toBe(403);
        expect(
          (
            await f.request(
              `publishers/${f.users[5]!.accountId}/name`,
              0,
              { displayName: 'Outro' },
              'PUT',
            )
          ).status,
        ).toBe(404);
        expect(
          (
            await f.request(
              'publisher-profile',
              1,
              { displayName: '   ' },
              'PUT',
            )
          ).status,
        ).toBe(400);
        expect(
          (
            await f.request(
              'publisher-profile',
              1,
              { displayName: 'Publicador', isAdmin: true },
              'PUT',
            )
          ).status,
        ).toBe(400);
        const path = `publishers/${f.users[1]!.accountId}/name`;
        await f.request(path, 0, { displayName: 'Nome atualizado' }, 'PUT');
        await f.request(path, 0, { displayName: 'Nome atualizado' }, 'PUT');
        expect(
          (
            await pool.query(
              'SELECT jsonb_array_length(changes) AS size FROM publisher_profile WHERE account_id=$1',
              [f.users[1]!.accountId],
            )
          ).rows[0].size,
        ).toBe(2);
        const r = await f.book();
        const detail = await (
          await f.request(`reservations/${r.id}`, 2, undefined, 'GET')
        ).json();
        expect(detail.participants[0].name).toBe('Nome atualizado');
        expect(JSON.stringify(detail)).not.toContain('@example.test');
        const directory = await (
          await f.request('reservation-publishers', 0, undefined, 'GET')
        ).json();
        expect(
          directory.some((p: { id: string }) => p.id === f.users[5]!.accountId),
        ).toBe(false);
      } finally {
        await f.app.close();
      }
    });
  }, 120_000);
});
