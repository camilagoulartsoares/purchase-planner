ALTER TABLE "Product"
  ADD COLUMN "purchaseIntent" TEXT NOT NULL DEFAULT 'WANT',
  ADD COLUMN "estimatedUses" INTEGER,
  ADD COLUMN "timesPostponed" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "decisionStatus" TEXT,
  ADD COLUMN "lastAnalyzedAt" TIMESTAMP(3);
