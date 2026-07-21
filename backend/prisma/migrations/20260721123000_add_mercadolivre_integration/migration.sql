ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Product"
ADD COLUMN IF NOT EXISTS "marketplace" TEXT,
ADD COLUMN IF NOT EXISTS "externalItemId" TEXT,
ADD COLUMN IF NOT EXISTS "externalData" JSONB,
ADD COLUMN IF NOT EXISTS "noLongerFavorited" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "importedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "lastMarketplaceSyncAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "targetPrice" DECIMAL,
ADD COLUMN IF NOT EXISTS "availability" TEXT;

UPDATE "Product"
SET "marketplace" = NULL
WHERE "marketplace" IS NOT NULL
  AND BTRIM("marketplace") = '';

UPDATE "Product"
SET "externalItemId" = NULL
WHERE "externalItemId" IS NOT NULL
  AND BTRIM("externalItemId") = '';

CREATE TABLE IF NOT EXISTS "MercadoLivreIntegration" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "meliUserId" TEXT NOT NULL,
  "nickname" TEXT,
  "siteId" TEXT,
  "accessTokenEncrypted" TEXT NOT NULL,
  "refreshTokenEncrypted" TEXT NOT NULL,
  "tokenType" TEXT NOT NULL DEFAULT 'Bearer',
  "scopes" TEXT NOT NULL,
  "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
  "lastRefreshedAt" TIMESTAMP(3),
  "lastSyncedAt" TIMESTAMP(3),
  "syncStatus" TEXT NOT NULL DEFAULT 'idle',
  "syncError" TEXT,
  "syncStartedAt" TIMESTAMP(3),
  "autoSyncEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MercadoLivreIntegration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MercadoLivreIntegration_userId_key" ON "MercadoLivreIntegration"("userId");

CREATE TABLE IF NOT EXISTS "MercadoLivreOAuthState" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "redirectTo" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MercadoLivreOAuthState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MercadoLivreOAuthState_state_key" ON "MercadoLivreOAuthState"("state");
CREATE INDEX IF NOT EXISTS "MercadoLivreOAuthState_userId_idx" ON "MercadoLivreOAuthState"("userId");
CREATE INDEX IF NOT EXISTS "MercadoLivreOAuthState_expiresAt_idx" ON "MercadoLivreOAuthState"("expiresAt");

CREATE TABLE IF NOT EXISTS "ProductPriceHistory" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "previousPrice" DECIMAL,
  "currentPrice" DECIMAL NOT NULL,
  "originalPrice" DECIMAL,
  "lowestRecordedPrice" DECIMAL,
  "discountPercentage" INTEGER,
  "availability" TEXT,
  "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "details" JSONB,
  CONSTRAINT "ProductPriceHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProductPriceHistory_productId_checkedAt_idx" ON "ProductPriceHistory"("productId", "checkedAt");

CREATE TABLE IF NOT EXISTS "UserNotification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "productId" TEXT,
  "type" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "payload" JSONB,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserNotification_dedupeKey_key" ON "UserNotification"("dedupeKey");
CREATE INDEX IF NOT EXISTS "UserNotification_userId_createdAt_idx" ON "UserNotification"("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "Product_userId_marketplace_idx" ON "Product"("userId", "marketplace");

DO $$
DECLARE duplicate_group_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO duplicate_group_count
  FROM (
    SELECT 1
    FROM "Product"
    WHERE "marketplace" IS NOT NULL
      AND BTRIM("marketplace") <> ''
      AND "externalItemId" IS NOT NULL
      AND BTRIM("externalItemId") <> ''
    GROUP BY "userId", "marketplace", "externalItemId"
    HAVING COUNT(*) > 1
  ) duplicate_groups;

  IF duplicate_group_count > 0 THEN
    RAISE EXCEPTION
      'Cannot apply Mercado Livre integration migration: found % duplicate imported product groups in Product(userId, marketplace, externalItemId). Resolve them before applying the partial unique index.',
      duplicate_group_count;
  END IF;
END $$;

DROP INDEX IF EXISTS "Product_userId_marketplace_externalItemId_key";

CREATE UNIQUE INDEX "Product_userId_marketplace_externalItemId_key"
ON "Product"("userId", "marketplace", "externalItemId")
WHERE "marketplace" IS NOT NULL
  AND BTRIM("marketplace") <> ''
  AND "externalItemId" IS NOT NULL
  AND BTRIM("externalItemId") <> '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'MercadoLivreIntegration_userId_fkey'
  ) THEN
    ALTER TABLE "MercadoLivreIntegration"
    ADD CONSTRAINT "MercadoLivreIntegration_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'MercadoLivreOAuthState_userId_fkey'
  ) THEN
    ALTER TABLE "MercadoLivreOAuthState"
    ADD CONSTRAINT "MercadoLivreOAuthState_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ProductPriceHistory_productId_fkey'
  ) THEN
    ALTER TABLE "ProductPriceHistory"
    ADD CONSTRAINT "ProductPriceHistory_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'UserNotification_userId_fkey'
  ) THEN
    ALTER TABLE "UserNotification"
    ADD CONSTRAINT "UserNotification_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'UserNotification_productId_fkey'
  ) THEN
    ALTER TABLE "UserNotification"
    ADD CONSTRAINT "UserNotification_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
