-- Staging-only data migration. Run manually in the Neon project
-- congregacaoprega-staging; do not add this file to Prisma migrations.
BEGIN;

DO $migration$
DECLARE
  total_congregations bigint;
  matching_congregations bigint;
BEGIN
  IF current_database() <> 'congregacaoprega_staging' THEN
    RAISE EXCEPTION 'First-congregation migration is restricted to the staging database';
  END IF;

  LOCK TABLE public.congregation IN SHARE ROW EXCLUSIVE MODE;

  SELECT
    count(*),
    count(*) FILTER (
      WHERE name = 'Congregação Homologação'
        AND timezone = 'America/Sao_Paulo'
    )
  INTO total_congregations, matching_congregations
  FROM public.congregation;

  IF total_congregations = 0 THEN
    INSERT INTO public.congregation (id, name, timezone)
    VALUES (gen_random_uuid(), 'Congregação Homologação', 'America/Sao_Paulo');
  ELSIF total_congregations = 1 AND matching_congregations = 1 THEN
    RAISE NOTICE 'Staging congregation already provisioned; no change made';
  ELSE
    RAISE EXCEPTION 'Unexpected congregation data; no change made';
  END IF;
END;
$migration$;

COMMIT;

SELECT name, timezone
FROM public.congregation
ORDER BY name;
