-- CreateEnum
CREATE TYPE "membership_role" AS ENUM ('PUBLISHER', 'LOCAL_ADMIN');

-- CreateEnum
CREATE TYPE "membership_status" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "identity_account" (
    "id" UUID NOT NULL,
    "provider_issuer" TEXT NOT NULL,
    "provider_subject" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_master" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identity_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "congregation" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "congregation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "congregation_id" UUID NOT NULL,
    "role" "membership_role" NOT NULL DEFAULT 'PUBLISHER',
    "status" "membership_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "membership_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "membership_status_revoked_at_check" CHECK (
        ("status" = 'ACTIVE' AND "revoked_at" IS NULL) OR
        ("status" = 'REVOKED' AND "revoked_at" IS NOT NULL)
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "identity_account_provider_issuer_provider_subject_key" ON "identity_account"("provider_issuer", "provider_subject");

-- CreateIndex
CREATE INDEX "membership_congregation_id_status_idx" ON "membership"("congregation_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "membership_account_id_congregation_id_key" ON "membership"("account_id", "congregation_id");

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "identity_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_congregation_id_fkey" FOREIGN KEY ("congregation_id") REFERENCES "congregation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
