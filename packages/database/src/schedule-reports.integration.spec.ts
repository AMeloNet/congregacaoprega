import { randomUUID } from 'node:crypto';
import { runPrisma, withDisposableDatabase } from './test-support/database.js';
import { reservationApp } from './test-support/reservation-app.js';
describe('monthly report emission', () => {
  it('atomically freezes a named snapshot with invitations, preserves reprints and cancelled dialogs, serializes participant races and emits a new version only after reopening', async () => {
    await withDisposableDatabase(async (url, pool) => {
      expect(runPrisma(url, ['migrate', 'deploy'])).toBe(0);
      const f = await reservationApp(pool);
      try {
        const r = await f.book(),
          second = await f.book(1, { date: `${f.month}-11` });
        await f.request(`reservations/${r.id}/join`, 2);
        const invitation = await (
          await f.request(`reservations/${r.id}/invitations`, 1, {
            requestKey: randomUUID(),
            recipientEmail: 'management-3@example.test',
          })
        ).json();
        const path = `schedule/${f.month}/finalize-print`,
          body = { requestKey: randomUUID() };
        expect((await f.request(path, 1, body)).status).toBe(403);
        expect((await f.request(path, 5, body)).status).toBe(403);
        expect(
          (await f.request(path, 0, { ...body, version: 99 })).status,
        ).toBe(400);
        const missing = await f.request(path, 0, body);
        expect(missing.status).toBe(409);
        expect((await missing.json()).code).toBe('PUBLISHER_NAMES_REQUIRED');
        expect(
          (
            await pool.query(
              'SELECT * FROM schedule_month WHERE congregation_id=$1',
              [f.congregation],
            )
          ).rowCount,
        ).toBe(0);
        for (const index of [1, 2, 3, 4])
          await f.request(
            `publishers/${f.users[index]!.accountId}/name`,
            0,
            { displayName: `Publicador Teste ${index}` },
            'PUT',
          );
        const preview = await (
          await f.request(
            `schedule/${f.month}/report-preview`,
            0,
            undefined,
            'GET',
          )
        ).json();
        expect(preview.draft).toBe(true);
        expect(preview.snapshot.entries[0].participants).toContainEqual({
          name: 'Publicador Teste 3',
          status: 'pending',
          responsible: false,
        });
        const race = await Promise.all([
          f.request(path, 0, body),
          f.request(`reservations/${second.id}/join`, 4),
        ]);
        expect(race[0]!.status).toBe(201);
        const emitted = await race[0]!.json();
        expect(emitted.version).toBe(1);
        const frozenSecond = emitted.snapshot.entries.find(
          (entry: { id: string }) => entry.id === second.id,
        );
        expect(frozenSecond.participants.length).toBe(
          race[1]!.status === 201 ? 2 : 1,
        );
        expect((await (await f.request(path, 0, body)).json()).id).toBe(
          emitted.id,
        );
        expect(
          (
            await (
              await f.request(path, 0, { requestKey: randomUUID() })
            ).json()
          ).id,
        ).toBe(emitted.id);
        expect(
          (
            await f.request(
              `reservation-invitations/${invitation.id}/decline`,
              3,
            )
          ).status,
        ).toBe(409);
        expect(
          (
            await f.request(`reservations/${r.id}/cancel`, 1, {
              requestKey: randomUUID(),
              scope: 'date',
            })
          ).status,
        ).toBe(409);
        expect(
          (
            await f.request(
              `schedule-reports/${emitted.id}`,
              1,
              undefined,
              'GET',
            )
          ).status,
        ).toBe(403);
        await pool.query(
          "UPDATE membership SET role='LOCAL_ADMIN' WHERE account_id=$1",
          [f.users[5]!.accountId],
        );
        expect(
          (
            await fetch(
              `${f.base.replace(f.congregation, f.foreign)}/schedule-reports/${emitted.id}`,
              { headers: f.users[5]!.headers },
            )
          ).status,
        ).toBe(404);
        const original = await (
          await f.request(`schedule-reports/${emitted.id}`, 0, undefined, 'GET')
        ).json();
        expect(JSON.stringify(original)).not.toContain('@example.test');
        await f.request(
          `publishers/${f.users[1]!.accountId}/name`,
          0,
          { displayName: 'Nome revisado' },
          'PUT',
        );
        expect(
          await (
            await f.request(
              `schedule-reports/${emitted.id}`,
              0,
              undefined,
              'GET',
            )
          ).json(),
        ).toEqual(original);
        await f.request(`schedule/${f.month}/reopen`);
        const detail = await (
          await f.request(`reservations/${r.id}`, 0, undefined, 'GET')
        ).json();
        expect(
          (
            await f.request(`reservations/${r.id}/administration`, 0, {
              requestKey: randomUUID(),
              revision: detail.revision,
              action: 'remove',
              accountId: f.users[2]!.accountId,
            })
          ).status,
        ).toBe(201);
        const next = await Promise.all([
          f.request(path, 0, { requestKey: randomUUID() }),
          f.request(path, 0, { requestKey: randomUUID() }),
        ]);
        const version2 = await next[0]!.json();
        expect(version2.version).toBe(2);
        expect((await next[1]!.json()).id).toBe(version2.id);
        expect(
          version2.snapshot.entries[0].participants.map(
            (p: { name: string }) => p.name,
          ),
        ).not.toContain('Publicador Teste 2');
        expect(version2.snapshot.entries[0].participants[0].name).toBe(
          'Nome revisado',
        );
        expect(
          (
            await pool.query(
              'SELECT count(*) FROM schedule_report WHERE congregation_id=$1',
              [f.congregation],
            )
          ).rows[0].count,
        ).toBe('2');
        expect(
          await (
            await f.request(
              `schedule-reports/${emitted.id}`,
              0,
              undefined,
              'GET',
            )
          ).json(),
        ).toEqual(original);
      } finally {
        await f.app.close();
      }
    });
  }, 120_000);
});
