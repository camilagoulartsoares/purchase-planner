CREATE TABLE "Finding" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "brand" TEXT,
  "store" TEXT,
  "description" TEXT,
  "price" DECIMAL,
  "previousPrice" DECIMAL,
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "originalUrl" TEXT NOT NULL,
  "normalizedUrl" TEXT NOT NULL,
  "category" TEXT,
  "availability" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "FindingMedia" (
  "id" TEXT NOT NULL,
  "findingId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FindingMedia_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Finding_userId_normalizedUrl_key" ON "Finding"("userId", "normalizedUrl");
CREATE INDEX "Finding_userId_createdAt_idx" ON "Finding"("userId", "createdAt");
CREATE INDEX "FindingMedia_findingId_position_idx" ON "FindingMedia"("findingId", "position");
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FindingMedia" ADD CONSTRAINT "FindingMedia_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
