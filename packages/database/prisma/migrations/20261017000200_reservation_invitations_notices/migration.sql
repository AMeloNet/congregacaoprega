CREATE TABLE reservation_invitation (
  id uuid PRIMARY KEY,
  reservation_id uuid NOT NULL REFERENCES reservation(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  recipient_account_id uuid NOT NULL REFERENCES identity_account(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  created_by_account_id uuid NOT NULL REFERENCES identity_account(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  request_key uuid NOT NULL,
  position integer NOT NULL CHECK(position IN(2,3)),
  state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','accepted','declined','expired','revoked','superseded','cancelled')),
  expires_at timestamptz(6) NOT NULL,
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at timestamptz(6),
  replaced_by_id uuid REFERENCES reservation_invitation(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT reservation_invitation_expiry_check CHECK(expires_at>created_at)
);
CREATE UNIQUE INDEX reservation_invitation_request_key ON reservation_invitation(reservation_id,request_key);
CREATE UNIQUE INDEX reservation_invitation_pending_position_idx ON reservation_invitation(reservation_id,position) WHERE state='pending';
CREATE UNIQUE INDEX reservation_invitation_pending_recipient_idx ON reservation_invitation(reservation_id,recipient_account_id) WHERE state='pending';
CREATE INDEX reservation_invitation_recipient_idx ON reservation_invitation(recipient_account_id,expires_at);

CREATE TABLE schedule_notice (
  id uuid PRIMARY KEY,
  congregation_id uuid NOT NULL REFERENCES congregation(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  recipient_account_id uuid NOT NULL REFERENCES identity_account(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  event_key text NOT NULL,
  message text NOT NULL,
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at timestamptz(6),
  mail_state text NOT NULL DEFAULT 'pending' CHECK(mail_state IN('pending','captured','sent','failed')),
  mail_attempts integer NOT NULL DEFAULT 0 CHECK(mail_attempts>=0),
  next_attempt_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_error text,
  provider_id text,
  delivered_at timestamptz(6)
);
CREATE UNIQUE INDEX schedule_notice_event_key ON schedule_notice(event_key,recipient_account_id);
CREATE INDEX schedule_notice_inbox_idx ON schedule_notice(congregation_id,recipient_account_id,created_at);
CREATE INDEX schedule_notice_delivery_idx ON schedule_notice(mail_state,next_attempt_at);
