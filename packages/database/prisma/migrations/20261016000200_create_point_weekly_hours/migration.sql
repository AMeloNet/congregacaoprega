-- Intentionally do not copy congregation-wide restrictions. Existing and new
-- points start unrestricted; legacy configuration and audit history are retained.
ALTER TABLE preaching_point ADD COLUMN weekly_hours_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE preaching_point ADD CONSTRAINT preaching_point_weekly_hours_version_check CHECK (weekly_hours_version >= 0);

CREATE TABLE point_weekly_hours_day (
  point_id UUID NOT NULL,
  day INTEGER NOT NULL,
  mode TEXT NOT NULL,
  intervals JSONB NOT NULL,
  CONSTRAINT point_weekly_hours_day_pkey PRIMARY KEY (point_id, day),
  CONSTRAINT point_weekly_hours_day_point_id_fkey FOREIGN KEY (point_id) REFERENCES preaching_point(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT point_weekly_hours_day_day_check CHECK (day BETWEEN 0 AND 6),
  CONSTRAINT point_weekly_hours_day_mode_check CHECK (mode IN ('closed', 'intervals')),
  CONSTRAINT point_weekly_hours_day_intervals_check CHECK (
    jsonb_typeof(intervals) = 'array' AND
    CASE WHEN mode = 'closed' THEN jsonb_array_length(intervals) = 0
         ELSE jsonb_array_length(intervals) BETWEEN 1 AND 1440 END
  )
);

CREATE TABLE point_weekly_hours_history (
  id UUID NOT NULL,
  point_id UUID NOT NULL,
  actor_account_id UUID NOT NULL,
  previous JSONB NOT NULL,
  configuration JSONB NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT point_weekly_hours_history_pkey PRIMARY KEY (id),
  CONSTRAINT point_weekly_hours_history_point_id_fkey FOREIGN KEY (point_id) REFERENCES preaching_point(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT point_weekly_hours_history_actor_account_id_fkey FOREIGN KEY (actor_account_id) REFERENCES identity_account(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX point_weekly_hours_history_point_created_idx ON point_weekly_hours_history(point_id, created_at);
