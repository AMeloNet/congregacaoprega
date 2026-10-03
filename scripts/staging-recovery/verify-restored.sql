-- Inspect only generic invariants; never print restored user data or tokens.
DO $verification$
BEGIN
  IF current_database() <> 'congregacaoprega_restore_test' THEN
    RAISE EXCEPTION 'Restore verification requires the disposable database';
  END IF;

  IF (SELECT count(*) FROM public._prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) < 2 THEN
    RAISE EXCEPTION 'Versioned Prisma migration history was not restored';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.congregation
                 WHERE name = 'Congregação Homologação'
                   AND timezone = 'America/Sao_Paulo') THEN
    RAISE EXCEPTION 'Fictitious congregation was not restored';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.identity_account WHERE is_master) THEN
    RAISE EXCEPTION 'Master account was not restored';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.membership
                 WHERE role = 'LOCAL_ADMIN' AND status = 'ACTIVE') THEN
    RAISE EXCEPTION 'Active local administrator was not restored';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.access_invitation
                 WHERE kind = 'MASTER_BOOTSTRAP' AND status = 'ACCEPTED')
     OR NOT EXISTS (SELECT 1 FROM public.access_invitation
                    WHERE kind = 'MEMBERSHIP' AND target_role = 'LOCAL_ADMIN'
                      AND status = 'ACCEPTED') THEN
    RAISE EXCEPTION 'Accepted fictitious invitations were not restored';
  END IF;
END;
$verification$;
