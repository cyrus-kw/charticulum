-- Links became codes. Any links still waiting are thrown away (they last
-- only 15 minutes anyway).
DELETE FROM "EmailToken";

-- AlterTable
ALTER TABLE "EmailToken" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "codeHash" TEXT NOT NULL;

