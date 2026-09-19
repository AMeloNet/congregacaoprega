import { defineConfig } from 'prisma/config';

const fixture = process.env.MIGRATION_FIXTURE;
const allowed = ['previous', 'full', 'broken'];
const url = process.env.DATABASE_URL;
if (
  !fixture ||
  !allowed.includes(fixture) ||
  !url ||
  !new URL(url).pathname.slice(1).endsWith('_test')
) {
  throw new Error(
    'Migration fixtures require an allowlisted fixture and a disposable *_test database.',
  );
}

export default defineConfig({
  schema: '../../tests/migration-fixtures/schema.prisma',
  migrations: { path: `../../tests/migration-fixtures/${fixture}/migrations` },
  datasource: { url },
});
