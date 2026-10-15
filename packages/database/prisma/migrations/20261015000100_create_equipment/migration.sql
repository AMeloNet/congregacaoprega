CREATE TYPE equipment_type AS ENUM ('CART', 'KIOSK', 'DISPLAY');
CREATE TABLE equipment (
  id uuid PRIMARY KEY,
  congregation_id uuid NOT NULL REFERENCES congregation(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  name text NOT NULL CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 80),
  type equipment_type NOT NULL,
  active boolean NOT NULL DEFAULT true,
  observation text NOT NULL DEFAULT '' CHECK (char_length(observation) <= 250)
);
CREATE UNIQUE INDEX equipment_congregation_name_key ON equipment (congregation_id, lower(name));
CREATE TABLE equipment_state_history (
  id uuid PRIMARY KEY,
  equipment_id uuid NOT NULL REFERENCES equipment(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  actor_account_id uuid NOT NULL REFERENCES identity_account(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  active boolean NOT NULL,
  observation text NOT NULL CHECK (char_length(observation) <= 250),
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX equipment_state_history_equipment_created_idx ON equipment_state_history (equipment_id, created_at);
