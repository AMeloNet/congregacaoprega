CREATE TABLE "schedule_month" (
  "congregation_id" UUID NOT NULL REFERENCES "congregation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "month" TEXT NOT NULL CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  "state" TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open','finalized','reopened')),
  CONSTRAINT "schedule_month_pkey" PRIMARY KEY ("congregation_id","month")
);
CREATE TABLE "schedule_month_history" (
  "id" UUID NOT NULL,
  "congregation_id" UUID NOT NULL,
  "month" TEXT NOT NULL,
  "actor_account_id" UUID NOT NULL REFERENCES "identity_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "previous_state" TEXT NOT NULL CHECK (previous_state IN ('open','finalized','reopened')),
  "state" TEXT NOT NULL CHECK (state IN ('finalized','reopened')),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "schedule_month_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "schedule_month_history_month_fkey" FOREIGN KEY ("congregation_id","month") REFERENCES "schedule_month"("congregation_id","month") ON DELETE RESTRICT ON UPDATE CASCADE
);
