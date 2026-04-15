-- AlterTable
ALTER TABLE "PendingSignup" ADD COLUMN     "lastResentAt" TIMESTAMP(3),
ADD COLUMN     "resendCount" INTEGER NOT NULL DEFAULT 0;
