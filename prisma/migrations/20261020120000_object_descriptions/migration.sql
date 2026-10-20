-- CreateTable
CREATE TABLE "ObjectDescription" (
    "schoolId" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "ObjectDescription_pkey" PRIMARY KEY ("schoolId","objectId")
);

-- AddForeignKey
ALTER TABLE "ObjectDescription" ADD CONSTRAINT "ObjectDescription_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

