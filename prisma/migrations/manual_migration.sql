-- Manual migration: Remove company requirement, add user OAuth fields
-- Run this SQL manually on your database before deploying

-- Add new columns to User table
ALTER TABLE "User" 
ADD COLUMN IF NOT EXISTS "whopProductId" TEXT,
ADD COLUMN IF NOT EXISTS "whopAccessToken" TEXT,
ADD COLUMN IF NOT EXISTS "whopRefreshToken" TEXT,
ADD COLUMN IF NOT EXISTS "tokenExpiresAt" TIMESTAMP;

-- Add userId column to Product table (make companyId nullable)
ALTER TABLE "Product"
ADD COLUMN IF NOT EXISTS "userId" TEXT,
ALTER COLUMN "companyId" DROP NOT NULL;

-- Add foreign key constraint for userId
ALTER TABLE "Product"
ADD CONSTRAINT "Product_userId_fkey" 
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Note: Existing products will have userId as NULL
-- You may want to backfill: UPDATE "Product" SET "userId" = (SELECT "id" FROM "User" WHERE "User"."companyId" = "Product"."companyId" LIMIT 1) WHERE "userId" IS NULL;

