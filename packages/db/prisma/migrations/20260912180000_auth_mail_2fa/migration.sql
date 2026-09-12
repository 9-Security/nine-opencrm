-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "mailAuthEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tenant" ADD COLUMN "mailImapHost" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "mailImapPort" INTEGER NOT NULL DEFAULT 993;
ALTER TABLE "Tenant" ADD COLUMN "mailPop3Host" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "mailPop3Port" INTEGER NOT NULL DEFAULT 995;
ALTER TABLE "Tenant" ADD COLUMN "require2fa" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "totpSecretEnc" TEXT;
ALTER TABLE "User" ADD COLUMN "totpEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "totpBackupHashes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "LoginChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "firstFactor" TEXT NOT NULL,
    "totpVerified" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LoginChallenge_tokenHash_key" ON "LoginChallenge"("tokenHash");
CREATE INDEX "LoginChallenge_userId_idx" ON "LoginChallenge"("userId");

ALTER TABLE "LoginChallenge" ADD CONSTRAINT "LoginChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
