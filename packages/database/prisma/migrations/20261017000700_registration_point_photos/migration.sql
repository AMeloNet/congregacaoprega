ALTER TYPE identity_audit_event_type ADD VALUE 'MEMBERSHIP_APPROVED';
CREATE TABLE publisher_registration (
  account_id uuid PRIMARY KEY REFERENCES identity_account(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  code varchar(10) NOT NULL CHECK (code ~ '^[A-Z0-9]{10}$'),
  display_name varchar(120) NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 120),
  phone varchar(30) NOT NULL CHECK (length(trim(phone)) BETWEEN 8 AND 30),
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX publisher_registration_code_key ON publisher_registration(code);
ALTER TABLE publisher_profile ADD COLUMN phone varchar(30) NOT NULL DEFAULT '';
ALTER TABLE preaching_point ADD COLUMN photo text NOT NULL DEFAULT '';
ALTER TABLE preaching_point ADD CONSTRAINT preaching_point_photo_size CHECK (octet_length(photo) <= 2796250);
