CREATE TABLE reservation_history (
  id uuid PRIMARY KEY,
  reservation_id uuid NOT NULL REFERENCES reservation(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  actor_account_id uuid NOT NULL REFERENCES identity_account(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  action text NOT NULL,
  previous jsonb NOT NULL,
  configuration jsonb NOT NULL,
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX reservation_history_reservation_created_idx ON reservation_history(reservation_id,created_at);

-- Preserve the weekly model before individual occurrences become editable.
ALTER TABLE reservation_series ADD COLUMN configuration jsonb;
UPDATE reservation_series s SET configuration=jsonb_build_object(
  'responsible_account_id',r.responsible_account_id,'point_id',r.point_id,
  'local_date',r.local_date,'start_hour',r.start_hour,'duration',r.duration,
  'equipment_type',r.equipment_type,'third_position_open',r.third_position_open
) FROM reservation r WHERE r.id=s.source_reservation_id;
ALTER TABLE reservation_series ALTER COLUMN configuration SET NOT NULL;
