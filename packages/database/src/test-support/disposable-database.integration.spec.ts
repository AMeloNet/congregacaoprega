import { Pool } from 'pg';
import { withDisposableDatabase } from './database.js';

describe('FIX-IDN-TEST-01 disposable database cleanup', () => {
  it('waits for another pool to close without terminating its connection', async () => {
    let otherPool: Pool | undefined;
    let closeOtherPool: Promise<void> | undefined;
    let closing = false;
    let closed = false;
    let terminated = false;

    try {
      await withDisposableDatabase(async (url) => {
        otherPool = new Pool({ connectionString: url });
        otherPool.on('error', () => {
          terminated = true;
        });
        await otherPool.query('SELECT 1');
        closeOtherPool = new Promise<void>((resolve) =>
          setTimeout(resolve, 350),
        ).then(async () => {
          closing = true;
          await otherPool?.end();
          closed = true;
        });
      });
      expect(closing).toBe(true);
      await closeOtherPool;
      expect(closed).toBe(true);
      expect(terminated).toBe(false);
    } finally {
      await closeOtherPool;
    }
  }, 30_000);
});
