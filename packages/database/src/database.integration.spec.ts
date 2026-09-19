import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

describe('disposable PostgreSQL', () => {
  it('enforces constraints and rolls back fictitious data', async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('TEST_DATABASE_URL é obrigatória para integração.');
    }

    const target = new URL(databaseUrl);
    const databaseName = target.pathname.slice(1);
    if (!databaseName.endsWith('_test')) {
      throw new Error('O banco de integração deve terminar com _test.');
    }

    const pool = new Pool({ connectionString: databaseUrl, max: 2 });
    const client = await pool.connect();
    const schema = `integration_${randomUUID().replaceAll('-', '')}`;

    try {
      await client.query('BEGIN');
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(
        `CREATE TABLE ${schema}.sample (id integer PRIMARY KEY, name text NOT NULL)`,
      );
      await client.query(`INSERT INTO ${schema}.sample VALUES (1, 'fictício')`);
      await expect(
        client.query(`INSERT INTO ${schema}.sample VALUES (1, 'duplicado')`),
      ).rejects.toMatchObject({ code: '23505' });
      await client.query('ROLLBACK');

      const result = await client.query<{ exists: boolean }>(
        'SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = $1) AS exists',
        [schema],
      );
      expect(result.rows[0]?.exists).toBe(false);
    } finally {
      client.release();
      await pool.end();
    }
  });
});
