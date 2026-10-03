-- Run only against the source database before creating a temporary dump.
DO $preflight$
BEGIN
  IF current_database() <> 'congregacaoprega_staging' THEN
    RAISE EXCEPTION 'Recovery drill requires the staging database';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.identity_account
    WHERE email !~* '^[^@[:space:]]+@example[.](test|invalid|com|org)$'
  ) OR EXISTS (
    SELECT 1 FROM public.access_invitation
    WHERE recipient_email !~* '^[^@[:space:]]+@example[.](test|invalid|com|org)$'
  ) THEN
    RAISE EXCEPTION 'Non-fictitious email found; backup was not started';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.congregation) THEN
    RAISE EXCEPTION 'Staging has no congregation to verify';
  END IF;
END;
$preflight$;
