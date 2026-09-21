import type { Pool, PoolClient } from 'pg';

export async function verifySchema(
  ...databases: (Pool | PoolClient)[]
): Promise<void> {
  void databases;
  throw new Error('Schema comparison is not implemented.');
}
