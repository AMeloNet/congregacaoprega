import { defineConfig } from 'prisma/config';

const url = process.env.DATABASE_URL;
const migrations = process.env.TEST_MIGRATIONS_PATH;
if (!url || !new URL(url).pathname.slice(1).endsWith('_test') || !migrations) {
  throw new Error(
    'History fixtures require a disposable *_test database and a migration path.',
  );
}

export default defineConfig({
  schema: '../../prisma/schema.prisma',
  migrations: { path: migrations },
  datasource: { url },
});
