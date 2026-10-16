CREATE TABLE "reservation" (
  "id" UUID NOT NULL,
  "congregation_id" UUID NOT NULL REFERENCES "congregation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "point_id" UUID NOT NULL REFERENCES "preaching_point"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "responsible_account_id" UUID NOT NULL REFERENCES "identity_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "request_key" UUID NOT NULL,
  "local_date" TEXT NOT NULL CHECK (local_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  "start_hour" INTEGER NOT NULL CHECK (start_hour BETWEEN 0 AND 23),
  "duration" INTEGER NOT NULL CHECK (duration IN (1,2)),
  "equipment_type" "equipment_type" NOT NULL,
  "third_position_open" BOOLEAN NOT NULL,
  "starts_at" TIMESTAMPTZ(6) NOT NULL,
  "ends_at" TIMESTAMPTZ(6) NOT NULL,
  "cancelled_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reservation_interval_check" CHECK (ends_at-starts_at=duration*INTERVAL '1 hour')
);
CREATE UNIQUE INDEX "reservation_request_key" ON "reservation" ("congregation_id","responsible_account_id","request_key");
CREATE INDEX "reservation_congregation_interval_idx" ON "reservation" ("congregation_id","starts_at","ends_at");
CREATE INDEX "reservation_responsible_interval_idx" ON "reservation" ("responsible_account_id","starts_at","ends_at");
