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
CREATE UNIQUE INDEX IF NOT EXISTS "Product_userId_marketplace_externalItemId_key" ON "Product"("userId", "marketplace", "externalItemId");

ALTER TABLE "MercadoLivreIntegration"
ADD CONSTRAINT "MercadoLivreIntegration_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MercadoLivreOAuthState"
ADD CONSTRAINT "MercadoLivreOAuthState_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductPriceHistory"
ADD CONSTRAINT "ProductPriceHistory_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserNotification"
ADD CONSTRAINT "UserNotification_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserNotification"
ADD CONSTRAINT "UserNotification_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
