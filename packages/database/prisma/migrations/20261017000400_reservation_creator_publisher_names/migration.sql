ALTER TABLE reservation ADD COLUMN created_by_account_id uuid;
UPDATE reservation SET created_by_account_id=responsible_account_id;
ALTER TABLE reservation ALTER COLUMN created_by_account_id SET NOT NULL;
ALTER TABLE reservation ADD CONSTRAINT reservation_created_by_account_id_fkey FOREIGN KEY(created_by_account_id) REFERENCES identity_account(id) ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX reservation_request_key;
CREATE UNIQUE INDEX reservation_request_key ON reservation(congregation_id,created_by_account_id,request_key);

CREATE TABLE publisher_profile (
  account_id uuid NOT NULL,
  congregation_id uuid NOT NULL,
  display_name text NOT NULL CHECK(length(trim(display_name)) BETWEEN 1 AND 120),
  changes jsonb NOT NULL DEFAULT '[]',
  PRIMARY KEY(account_id,congregation_id),
  CONSTRAINT publisher_profile_membership_fkey FOREIGN KEY(account_id,congregation_id) REFERENCES membership(account_id,congregation_id) ON DELETE RESTRICT ON UPDATE CASCADE
);
