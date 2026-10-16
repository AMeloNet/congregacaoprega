ALTER TABLE congregation ADD COLUMN weekly_hours_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE congregation ADD CONSTRAINT congregation_weekly_hours_version_check CHECK (weekly_hours_version >= 0);

CREATE TABLE weekly_hours_day (
  congregation_id UUID NOT NULL,
  day INTEGER NOT NULL,
  mode TEXT NOT NULL,
  intervals JSONB NOT NULL,
  CONSTRAINT weekly_hours_day_pkey PRIMARY KEY (congregation_id, day),
  CONSTRAINT weekly_hours_day_congregation_id_fkey FOREIGN KEY (congregation_id) REFERENCES congregation(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT weekly_hours_day_day_check CHECK (day BETWEEN 0 AND 6),
  CONSTRAINT weekly_hours_day_mode_check CHECK (mode IN ('closed', 'intervals')),
  CONSTRAINT weekly_hours_day_intervals_check CHECK (
    jsonb_typeof(intervals) = 'array' AND
    CASE WHEN mode = 'closed' THEN jsonb_array_length(intervals) = 0
         ELSE jsonb_array_length(intervals) BETWEEN 1 AND 1440 END
  )
);

CREATE TABLE weekly_hours_history (
  id UUID NOT NULL,
  congregation_id UUID NOT NULL,
  actor_account_id UUID NOT NULL,
  previous JSONB NOT NULL,
  configuration JSONB NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT weekly_hours_history_pkey PRIMARY KEY (id),
  CONSTRAINT weekly_hours_history_congregation_id_fkey FOREIGN KEY (congregation_id) REFERENCES congregation(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT weekly_hours_history_actor_account_id_fkey FOREIGN KEY (actor_account_id) REFERENCES identity_account(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX weekly_hours_history_congregation_created_idx ON weekly_hours_history(congregation_id, created_at);
