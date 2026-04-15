-- AlterTable
ALTER TABLE "ForumAnswer" ADD COLUMN     "isAnonymous" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "ForumPost" ADD COLUMN     "isAnonymous" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "profileVisibility" TEXT NOT NULL DEFAULT 'hidden';
