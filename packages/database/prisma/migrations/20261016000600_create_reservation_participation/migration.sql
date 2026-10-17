CREATE TABLE "reservation_participation" (
  "reservation_id" UUID NOT NULL REFERENCES "reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "account_id" UUID NOT NULL REFERENCES "identity_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "position" INTEGER NOT NULL CHECK (position IN (2,3)),
  "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "starts_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "reservation_participation_pkey" PRIMARY KEY ("reservation_id","account_id"),
  CONSTRAINT "reservation_participation_start_check" CHECK (starts_at >= joined_at)
);
CREATE UNIQUE INDEX "reservation_participation_position_key" ON "reservation_participation" ("reservation_id","position");
CREATE INDEX "reservation_participation_account_start_idx" ON "reservation_participation" ("account_id","starts_at");
