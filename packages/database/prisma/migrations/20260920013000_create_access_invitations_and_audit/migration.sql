-- CreateEnum
CREATE TYPE "invitation_kind" AS ENUM ('MEMBERSHIP', 'MASTER_BOOTSTRAP');

-- CreateEnum
CREATE TYPE "invitation_status" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED', 'EXPIRED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "identity_audit_event_type" AS ENUM ('MEMBERSHIP_INVITED', 'MEMBERSHIP_REVOKED', 'MEMBERSHIP_REACTIVATED', 'LOCAL_ADMIN_GRANTED', 'LOCAL_ADMIN_REVOKED', 'MASTER_BOOTSTRAP_ISSUED');

-- CreateEnum
CREATE TYPE "identity_audit_outcome" AS ENUM ('SUCCEEDED', 'DENIED', 'FAILED');

-- CreateTable
CREATE TABLE "access_invitation" (
    "id" UUID NOT NULL,
    "kind" "invitation_kind" NOT NULL,
    "congregation_id" UUID,
    "recipient_email" TEXT NOT NULL,
    "recipient_email_normalized" TEXT NOT NULL,
    "token_digest" BYTEA NOT NULL,
    "target_role" "membership_role",
    "status" "invitation_status" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),
    "invalidated_at" TIMESTAMPTZ(6),
    "created_by_account_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_invitation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "access_invitation_recipient_email_normalized_check" CHECK ("recipient_email_normalized" = lower("recipient_email")),
    CONSTRAINT "access_invitation_kind_scope_check" CHECK (
        ("kind" = 'MEMBERSHIP' AND "congregation_id" IS NOT NULL AND "target_role" IS NOT NULL) OR
        ("kind" = 'MASTER_BOOTSTRAP' AND "congregation_id" IS NULL AND "target_role" IS NULL)
    ),
    CONSTRAINT "access_invitation_expiration_check" CHECK ("expires_at" > "created_at"),
    CONSTRAINT "access_invitation_completion_check" CHECK (
        ("status" = 'PENDING' AND "completed_at" IS NULL AND "invalidated_at" IS NULL) OR
        ("status" IN ('ACCEPTED', 'DECLINED') AND "completed_at" IS NOT NULL AND "invalidated_at" IS NULL) OR
        ("status" IN ('REVOKED', 'EXPIRED', 'SUPERSEDED') AND "completed_at" IS NULL AND "invalidated_at" IS NOT NULL)
    )
);

-- CreateTable
CREATE TABLE "identity_audit_event" (
    "id" UUID NOT NULL,
    "event_type" "identity_audit_event_type" NOT NULL,
    "outcome" "identity_audit_outcome" NOT NULL,
    "actor_account_id" UUID,
    "subject_account_id" UUID,
    "congregation_id" UUID,
    "invitation_id" UUID,
    "membership_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identity_audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "access_invitation_token_digest_key" ON "access_invitation"("token_digest");

-- CreateIndex
CREATE INDEX "access_invitation_congregation_id_recipient_email_normalized_idx" ON "access_invitation"("congregation_id", "recipient_email_normalized");

-- CreateIndex
CREATE UNIQUE INDEX "access_invitation_pending_membership_recipient_key" ON "access_invitation"("congregation_id", "recipient_email_normalized") WHERE "kind" = 'MEMBERSHIP' AND "status" = 'PENDING';

-- CreateIndex
CREATE UNIQUE INDEX "access_invitation_pending_master_bootstrap_key" ON "access_invitation"("kind") WHERE "kind" = 'MASTER_BOOTSTRAP' AND "status" = 'PENDING';

-- CreateIndex
CREATE INDEX "identity_audit_event_congregation_id_created_at_idx" ON "identity_audit_event"("congregation_id", "created_at");

-- AddForeignKey
ALTER TABLE "access_invitation" ADD CONSTRAINT "access_invitation_congregation_id_fkey" FOREIGN KEY ("congregation_id") REFERENCES "congregation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_invitation" ADD CONSTRAINT "access_invitation_created_by_account_id_fkey" FOREIGN KEY ("created_by_account_id") REFERENCES "identity_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_audit_event" ADD CONSTRAINT "identity_audit_event_actor_account_id_fkey" FOREIGN KEY ("actor_account_id") REFERENCES "identity_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_audit_event" ADD CONSTRAINT "identity_audit_event_subject_account_id_fkey" FOREIGN KEY ("subject_account_id") REFERENCES "identity_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_audit_event" ADD CONSTRAINT "identity_audit_event_congregation_id_fkey" FOREIGN KEY ("congregation_id") REFERENCES "congregation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_audit_event" ADD CONSTRAINT "identity_audit_event_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "access_invitation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_audit_event" ADD CONSTRAINT "identity_audit_event_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
