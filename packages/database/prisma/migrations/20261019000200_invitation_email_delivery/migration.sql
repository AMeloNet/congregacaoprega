CREATE TABLE access_invitation_mail (
  invitation_id uuid PRIMARY KEY REFERENCES access_invitation(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  mail_state text NOT NULL DEFAULT 'pending' CHECK(mail_state IN ('pending','captured','sent','failed','superseded')),
  mail_transport text CHECK(mail_transport IN ('capture','resend')),
  mail_envelope jsonb NOT NULL,
  mail_payload jsonb,
  mail_attempts integer NOT NULL DEFAULT 0 CHECK(mail_attempts >= 0),
  next_attempt_at timestamptz(6),
  first_attempt_at timestamptz(6),
  last_error text,
  provider_id text UNIQUE,
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT access_invitation_mail_schedule_check CHECK(
    (mail_state = 'pending' AND next_attempt_at IS NOT NULL)
    OR (mail_state IN ('captured','sent','superseded') AND next_attempt_at IS NULL)
    OR mail_state = 'failed'
  )
);

CREATE INDEX access_invitation_mail_delivery_idx
  ON access_invitation_mail(mail_state,next_attempt_at);
