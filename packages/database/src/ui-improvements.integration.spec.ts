import { randomUUID } from 'node:crypto';
import { runPrisma, withDisposableDatabase } from './test-support/database.js';
import { reservationApp } from './test-support/reservation-app.js';
import { PublisherRegistrationService } from '../../../apps/api/src/publisher-registration.service.js';
import { PublisherProfilesService } from '../../../apps/api/src/publisher-profiles.service.js';
import { ReservationEditService } from '../../../apps/api/src/reservation-edit.service.js';
import { ReservationAdministrationService } from '../../../apps/api/src/reservation-administration.service.js';
import { ReservationsService } from '../../../apps/api/src/reservations.service.js';
import { PointsService } from '../../../apps/api/src/points.service.js';

describe('UI-004 approved access, administrative reservations and point photos', () => {
  it('requires verified registration and local approval, isolates profiles and photos, and validates directed creation and audited edits', async () => {
    await withDisposableDatabase(async (url, pool) => {
      expect(runPrisma(url, ['migrate', 'deploy'])).toBe(0);
      const f = await reservationApp(pool);
      try {
        const admin = f.users[0]!.accountId,
          member = f.users[1]!.accountId,
          outsider = f.users[5]!.accountId,
          unverified = f.users[6]!.accountId;
        const registration = new PublisherRegistrationService(pool),
          profiles = new PublisherProfilesService(pool),
          points = new PointsService(pool);
        await pool.query('DELETE FROM membership WHERE account_id=$1', [
          outsider,
        ]);
        await expect(
          registration.profile(unverified, {
            displayName: 'Example',
            phone: '11999990000',
          }),
        ).rejects.toMatchObject({ status: 403 });
        const registered = await registration.profile(outsider, {
          displayName: 'Example Publisher',
          phone: '+55 11 99999-0000',
        });
        expect(registered.code).toMatch(/^[A-Z0-9]{10}$/);
        const updated = await registration.profile(outsider, {
          displayName: 'Example Updated',
          phone: '11999990000',
        });
        expect(updated.code).toBe(registered.code);
        await expect(
          new ReservationsService(pool).create(outsider, f.congregation, {}),
        ).rejects.toMatchObject({ status: 400 });
        expect((await f.request('schedule', 5, undefined, 'GET')).status).toBe(
          403,
        );
        await expect(
          registration.approve(member, f.congregation, {
            code: registered.code,
          }),
        ).rejects.toMatchObject({ status: 403 });
        await expect(
          registration.approve(admin, f.foreign, { code: registered.code }),
        ).rejects.toMatchObject({ status: 403 });
        await expect(
          registration.approve(admin, f.congregation, { code: '0000000000' }),
        ).rejects.toMatchObject({ status: 404 });
        await registration.approve(admin, f.congregation, {
          code: registered.code.toLowerCase(),
        });
        await registration.approve(admin, f.congregation, {
          code: registered.code,
        });
        expect(
          (
            await pool.query(
              'SELECT count(*)::int AS count FROM membership WHERE account_id=$1 AND congregation_id=$2',
              [outsider, f.congregation],
            )
          ).rows[0].count,
        ).toBe(1);
        expect(await profiles.execute(outsider, f.congregation)).toMatchObject({
          displayName: 'Example Updated',
          phone: '11999990000',
        });
        await profiles.execute(admin, f.congregation, outsider, {
          displayName: 'Admin correction',
          phone: '11888880000',
        });
        await expect(
          profiles.execute(member, f.congregation, outsider, {
            displayName: 'Unauthorized',
            phone: '11888880000',
          }),
        ).rejects.toMatchObject({ status: 403 });
        expect((await registration.profile(outsider)).displayName).toBe(
          'Example Updated',
        );
        await pool.query(
          "UPDATE membership SET status='REVOKED',revoked_at=now() WHERE account_id=$1",
          [outsider],
        );
        await expect(
          registration.approve(admin, f.congregation, {
            code: registered.code,
          }),
        ).rejects.toMatchObject({ status: 409 });
        expect((await f.request('schedule', 5, undefined, 'GET')).status).toBe(
          403,
        );
        const png =
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
        const config = {
          name: 'Photo point',
          allowedTypes: ['CART'],
          capacity: 1,
          photo: png,
        };
        const point = await points.execute(
          admin,
          f.congregation,
          'create',
          config,
        );
        expect(
          await points.execute(
            member,
            f.congregation,
            'photo',
            undefined,
            point.id,
          ),
        ).toEqual({ photo: png });
        await expect(
          points.execute(member, f.congregation, 'update', config, point.id),
        ).rejects.toMatchObject({ status: 403 });
        await expect(
          points.execute(admin, f.foreign, 'photo', undefined, point.id),
        ).rejects.toMatchObject({ status: 403 });
        for (const photo of [
          'data:image/svg+xml;base64,PHN2Zy8+',
          'data:image/png;base64,' + 'A'.repeat(2796250),
          'data:image/jpeg;base64,aGVsbG8=',
        ])
          await expect(
            points.execute(
              admin,
              f.congregation,
              'update',
              { ...config, photo },
              point.id,
            ),
          ).rejects.toMatchObject({ status: 400 });
        await points.execute(
          admin,
          f.congregation,
          'update',
          { ...config, photo: '' },
          point.id,
        );
        expect(
          await points.execute(
            member,
            f.congregation,
            'photo',
            undefined,
            point.id,
          ),
        ).toEqual({ photo: '' });
        const payload = {
          pointId: f.point,
          date: `${f.month}-10`,
          startHour: 8,
          duration: 2,
          equipmentType: 'CART',
          thirdPositionOpen: true,
          responsibleAccountId: member,
          requestKey: randomUUID(),
        };
        expect((await f.request('reservations', 2, payload)).status).toBe(403);
        expect(
          (
            await f.request('reservations', 0, {
              ...payload,
              responsibleAccountId: outsider,
            })
          ).status,
        ).toBe(403);
        expect((await f.request('reservations', 0, payload)).status).toBe(201);
        const reservation = await new ReservationsService(pool).create(
          admin,
          f.congregation,
          payload,
        );
        const stored = (
          await pool.query('SELECT * FROM reservation WHERE id=$1', [
            reservation.id,
          ])
        ).rows[0];
        expect(stored.created_by_account_id).toBe(admin);
        expect(stored.responsible_account_id).toBe(member);
        expect(
          (
            await pool.query(
              'SELECT account_id FROM reservation_attendance WHERE reservation_id=$1',
              [reservation.id],
            )
          ).rows,
        ).toEqual([{ account_id: member }]);
        const administration = new ReservationAdministrationService(pool),
          edit = new ReservationEditService(pool);
        let detail = await administration.detail(
          admin,
          f.congregation,
          reservation.id,
        );
        const changes = {
          requestKey: randomUUID(),
          revision: detail.revision,
          pointId: point.id,
          date: payload.date,
          startHour: 12,
          duration: 1,
          equipmentType: 'CART',
          thirdPositionOpen: false,
        };
        await expect(
          edit.execute(member, f.congregation, reservation.id, changes),
        ).rejects.toMatchObject({ status: 403 });
        expect(
          await edit.execute(admin, f.congregation, reservation.id, changes),
        ).toEqual({ id: reservation.id, updated: true });
        expect(
          await edit.execute(admin, f.congregation, reservation.id, changes),
        ).toEqual({ id: reservation.id, updated: true });
        await expect(
          edit.execute(admin, f.congregation, reservation.id, {
            ...changes,
            requestKey: randomUUID(),
          }),
        ).rejects.toMatchObject({ status: 409 });
        detail = await administration.detail(
          admin,
          f.congregation,
          reservation.id,
        );
        expect(detail).toMatchObject({
          pointId: point.id,
          startHour: 12,
          duration: 1,
          thirdPositionOpen: false,
        });
        expect(detail.history.some((h) => h.action === 'admin-edited')).toBe(
          true,
        );
        await f.book(2, { startHour: 14, duration: 1 });
        await expect(
          edit.execute(admin, f.congregation, reservation.id, {
            ...changes,
            requestKey: randomUUID(),
            revision: detail.revision,
            startHour: 14,
          }),
        ).rejects.toMatchObject({ status: 409 });
        await pool.query(
          "INSERT INTO schedule_month (congregation_id,month,state) VALUES ($1,$2,'finalized')",
          [f.congregation, f.month],
        );
        await expect(
          edit.execute(admin, f.congregation, reservation.id, {
            ...changes,
            requestKey: randomUUID(),
            revision: detail.revision,
            startHour: 16,
          }),
        ).rejects.toMatchObject({ status: 409 });
        expect(
          (
            await pool.query(
              "SELECT count(*)::int AS n FROM schedule_notice WHERE congregation_id=$1 AND message LIKE '%alterou os dados%'",
              [f.congregation],
            )
          ).rows[0].n,
        ).toBeGreaterThan(0);
      } finally {
        await f.app.close();
      }
    });
  }, 120000);
});
