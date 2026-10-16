CREATE TABLE "reservation_series" (
  "id" UUID NOT NULL,
  "source_reservation_id" UUID NOT NULL REFERENCES "reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "started_by_account_id" UUID NOT NULL REFERENCES "identity_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "stopped_at" TIMESTAMPTZ(6),
  "stopped_by_account_id" UUID REFERENCES "identity_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "reservation_series_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reservation_series_stop_check" CHECK ((stopped_at IS NULL)=(stopped_by_account_id IS NULL))
);
CREATE UNIQUE INDEX "reservation_series_source_key" ON "reservation_series" ("source_reservation_id");
CREATE TABLE "recurrence_occurrence" (
  "id" UUID NOT NULL,
  "series_id" UUID NOT NULL REFERENCES "reservation_series"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "local_date" TEXT NOT NULL CHECK (local_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  "reservation_id" UUID REFERENCES "reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "error" TEXT,
  "attempts" JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(attempts)='array'),
  "attempted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recurrence_occurrence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "recurrence_occurrence_result_check" CHECK ((reservation_id IS NOT NULL AND error IS NULL) OR (reservation_id IS NULL AND error IS NOT NULL))
);
CREATE UNIQUE INDEX "recurrence_occurrence_date_key" ON "recurrence_occurrence" ("series_id","local_date");
CREATE UNIQUE INDEX "recurrence_occurrence_reservation_key" ON "recurrence_occurrence" ("reservation_id");
