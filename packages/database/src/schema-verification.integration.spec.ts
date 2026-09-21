import {
  createSchemaReference,
  runPrisma,
  withDisposableDatabase,
} from './test-support/database.js';
import { verifySchema } from './test-support/schema-verification.js';

describe('IDN-A06 / IDN-B06 schema verification', () => {
  it('compares the real history and model, rejecting independent catalog mutations', async () => {
    await withDisposableDatabase(async (actualUrl, actual) => {
      await withDisposableDatabase(async (historyUrl, history) => {
        await withDisposableDatabase(async (modelUrl, model) => {
          expect(runPrisma(actualUrl, ['migrate', 'deploy'])).toBe(0);
          expect(runPrisma(historyUrl, ['migrate', 'deploy'])).toBe(0);
          await createSchemaReference(modelUrl, model);
          await expect(
            verifySchema(actual, history, model),
          ).resolves.toBeUndefined();

          const mutations = [
            'ALTER TABLE identity_account ADD COLUMN unexpected_contact text',
            'ALTER TABLE access_invitation ADD COLUMN unexpected_delivery text',
            'ALTER TABLE congregation ALTER COLUMN name TYPE varchar(200)',
            'ALTER TABLE identity_account ALTER COLUMN is_master SET DEFAULT true',
            'ALTER TABLE membership DROP CONSTRAINT membership_status_revoked_at_check',
            'ALTER TABLE access_invitation DROP CONSTRAINT access_invitation_recipient_email_normalized_check',
            'ALTER TABLE access_invitation DROP CONSTRAINT access_invitation_expiration_check; ALTER TABLE access_invitation ADD CONSTRAINT access_invitation_expiration_check CHECK (expires_at >= created_at)',
            'DROP INDEX access_invitation_pending_membership_recipient_key',
            "DROP INDEX access_invitation_pending_master_bootstrap_key; CREATE UNIQUE INDEX access_invitation_pending_master_bootstrap_key ON access_invitation(kind) WHERE kind = 'MASTER_BOOTSTRAP' AND status = 'ACCEPTED'",
            "ALTER TYPE membership_role ADD VALUE 'UNEXPECTED_ROLE'",
            'CREATE VIEW unexpected_view AS SELECT id FROM identity_account',
            'CREATE FUNCTION pg_temp.keep_row() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$; CREATE TRIGGER unexpected_trigger BEFORE UPDATE ON identity_account FOR EACH ROW EXECUTE FUNCTION pg_temp.keep_row()',
          ];
          const client = await actual.connect();
          try {
            for (const mutation of mutations) {
              await client.query('BEGIN');
              try {
                await client.query(mutation);
                await expect(
                  verifySchema(client, history, model),
                  mutation,
                ).rejects.toThrow('Schema drift');
              } finally {
                await client.query('ROLLBACK');
              }
              await expect(
                verifySchema(client, history, model),
              ).resolves.toBeUndefined();
            }
          } finally {
            client.release();
          }
          await model.query(
            'ALTER TABLE identity_account ADD COLUMN model_only text',
          );
          await expect(verifySchema(actual, history, model)).rejects.toThrow(
            'Prisma model drift',
          );
        });
      });
    });
  }, 240_000);
});
