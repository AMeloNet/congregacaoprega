CREATE TABLE reservation_attendance (
  id uuid PRIMARY KEY,
  reservation_id uuid NOT NULL REFERENCES reservation(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  account_id uuid NOT NULL REFERENCES identity_account(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  starts_at timestamptz(6) NOT NULL,
  ends_at timestamptz(6) NOT NULL,
  CONSTRAINT reservation_attendance_interval_check CHECK(ends_at>=starts_at)
);
CREATE INDEX reservation_attendance_account_interval_idx ON reservation_attendance(account_id,starts_at,ends_at);
INSERT INTO reservation_attendance(id,reservation_id,account_id,starts_at,ends_at)
 SELECT gen_random_uuid(),id,responsible_account_id,starts_at,greatest(starts_at,least(ends_at,coalesce(cancelled_at,ends_at))) FROM reservation;
INSERT INTO reservation_attendance(id,reservation_id,account_id,starts_at,ends_at)
 SELECT gen_random_uuid(),r.id,p.account_id,p.starts_at,greatest(p.starts_at,least(r.ends_at,coalesce(r.cancelled_at,r.ends_at))) FROM reservation_participation p JOIN reservation r ON r.id=p.reservation_id;

CREATE TABLE reservation_command (
  congregation_id uuid NOT NULL REFERENCES congregation(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  actor_account_id uuid NOT NULL REFERENCES identity_account(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  request_key uuid NOT NULL,
  reservation_id uuid NOT NULL REFERENCES reservation(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  action text NOT NULL,
  payload jsonb NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(congregation_id,actor_account_id,request_key)
);
CREATE TABLE schedule_alert_recipient (
  congregation_id uuid NOT NULL REFERENCES congregation(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  account_id uuid NOT NULL REFERENCES identity_account(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  PRIMARY KEY(congregation_id,account_id)
);
CREATE TABLE reservation_alert (
  reservation_id uuid PRIMARY KEY REFERENCES reservation(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  confirmed_at_start integer NOT NULL CHECK(confirmed_at_start BETWEEN 0 AND 3),
  raised_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
