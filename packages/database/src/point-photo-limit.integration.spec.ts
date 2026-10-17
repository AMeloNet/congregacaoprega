import { crc32 } from 'node:zlib';
import { runPrisma, withDisposableDatabase } from './test-support/database.js';
import { reservationApp } from './test-support/reservation-app.js';
import { maxPointPhotoBytes } from '../../../apps/api/src/point-photo.js';

// A valid one-pixel PNG padded with an ancillary text chunk, with a real CRC.
function photoOfSize(bytes: number) {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
    'base64',
  );
  const chunk = Buffer.alloc(bytes - png.length, 32);
  const length = chunk.length - 12;
  chunk.writeUInt32BE(length, 0);
  chunk.write('tEXt', 4);
  chunk.write('Comment\0', 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), chunk.length - 4);
  const result = Buffer.concat([
    png.subarray(0, -12),
    chunk,
    png.subarray(-12),
  ]);
  expect(result.length).toBe(bytes);
  return `data:image/png;base64,${result.toString('base64')}`;
}

it('accepts an actual 20 MiB photo through HTTP and PostgreSQL, rejects one byte above it and keeps photo reads authorized', async () => {
  await withDisposableDatabase(async (url, pool) => {
    expect(runPrisma(url, ['migrate', 'deploy'])).toBe(0);
    const f = await reservationApp(pool);
    try {
      const photo = photoOfSize(maxPointPhotoBytes);
      const input = {
        name: 'Photo limit example',
        allowedTypes: ['CART'],
        photo,
      };
      const created = await f.request('points', 0, input);
      expect(created.status).toBe(201);
      const point = await created.json();
      expect(point.photo === photo).toBe(true);
      const read = await f.request(
        `points/${point.id}/photo`,
        1,
        undefined,
        'GET',
      );
      expect(read.status).toBe(200);
      expect((await read.json()).photo === photo).toBe(true);
      expect(
        (await f.request(`points/${point.id}/photo`, 5, undefined, 'GET'))
          .status,
      ).toBe(403);
      expect((await fetch(`${f.base}/points/${point.id}/photo`)).status).toBe(
        401,
      );
      const oversized = await f.request(
        `points/${point.id}`,
        0,
        {
          ...input,
          capacity: 1,
          photo: photoOfSize(maxPointPhotoBytes + 1),
        },
        'PUT',
      );
      expect(oversized.status).toBe(400);
      expect((await oversized.json()).message).toContain('20 MB');
      const persisted = async () =>
        Number(
          (
            await pool.query(
              'SELECT octet_length(photo) AS size FROM preaching_point WHERE id=$1',
              [point.id],
            )
          ).rows[0].size,
        );
      expect(await persisted()).toBe(Buffer.byteLength(photo));
      await expect(
        pool.query(
          "UPDATE preaching_point SET photo=repeat('x',27962052) WHERE id=$1",
          [point.id],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      expect(await persisted()).toBe(Buffer.byteLength(photo));
    } finally {
      await f.app.close();
    }
  });
}, 120_000);
