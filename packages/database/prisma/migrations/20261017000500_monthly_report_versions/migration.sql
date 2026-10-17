CREATE TABLE schedule_report (
  id uuid PRIMARY KEY,
  congregation_id uuid NOT NULL,
  month text NOT NULL,
  version integer NOT NULL CHECK(version>0),
  actor_account_id uuid NOT NULL REFERENCES identity_account(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  request_key uuid NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT schedule_report_month_fkey FOREIGN KEY(congregation_id,month) REFERENCES schedule_month(congregation_id,month) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX schedule_report_version_key ON schedule_report(congregation_id,month,version);
CREATE UNIQUE INDEX schedule_report_request_key ON schedule_report(congregation_id,actor_account_id,request_key);
