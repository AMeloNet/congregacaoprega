ALTER TABLE schedule_notice
  ALTER COLUMN next_attempt_at DROP NOT NULL,
  ADD COLUMN mail_transport text CHECK(mail_transport IN ('capture','resend')),
  ADD COLUMN mail_payload jsonb,
  ADD COLUMN first_attempt_at timestamptz(6);
-- Existing attempts belong to the previously exclusive capture transport.
UPDATE schedule_notice SET mail_transport='capture' WHERE mail_attempts>0 OR mail_state='captured';
CREATE UNIQUE INDEX schedule_notice_provider_id_key ON schedule_notice(provider_id);

CREATE TABLE schedule_mail_event (
  id text PRIMARY KEY,
  provider_id text NOT NULL,
  event_type text NOT NULL,
  occurred_at timestamptz(6) NOT NULL,
  received_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX schedule_mail_event_provider_idx ON schedule_mail_event(provider_id);
