-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "whopCompanyId" TEXT NOT NULL UNIQUE,
    "name" TEXT NOT NULL,
    "whopAccessToken" TEXT,
    "whopRefreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "whopProductId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Temporary: create legacy companies from existing product owners
INSERT INTO "Company" ("id", "whopCompanyId", "name")
SELECT DISTINCT
  "ownerId" AS "id",
  ('legacy_' || "ownerId") AS "whopCompanyId",
  ('Legacy Company ' || "ownerId") AS "name"
FROM "Product";

-- Add companyId column to User
ALTER TABLE "User" ADD COLUMN "companyId" TEXT;

-- Add companyId column to Product
ALTER TABLE "Product" ADD COLUMN "companyId" TEXT;

-- Backfill Product.companyId from legacy ownerId
UPDATE "Product"
SET "companyId" = "ownerId";

-- Backfill User.companyId where the user owned products
UPDATE "User"
SET "companyId" = "id"
WHERE "id" IN (SELECT DISTINCT "ownerId" FROM "Product");

-- Ensure every product now has a companyId
UPDATE "Product"
SET "companyId" = (
  SELECT "companyId" FROM "User" WHERE "User"."id" = "Product"."ownerId"
)
WHERE "companyId" IS NULL;

-- Make Product.companyId required
ALTER TABLE "Product"
ALTER COLUMN "companyId" SET NOT NULL;

-- Drop old owner relation
ALTER TABLE "Product" DROP COLUMN "ownerId";

-- Add foreign keys
ALTER TABLE "Product"
ADD CONSTRAINT "Product_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "User"
ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

