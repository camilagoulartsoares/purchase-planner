-- Persistent Personal Shopper catalog memory: query intent, products and offers.
CREATE TABLE "ShopperCatalogQuery" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "originalQuery" TEXT NOT NULL,
  "intentKey" TEXT NOT NULL,
  "intent" JSONB NOT NULL,
  "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "mapExpiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShopperCatalogQuery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShopperCatalogProduct" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "identityKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "brand" TEXT,
  "line" TEXT,
  "composition" JSONB,
  "measure" TEXT,
  "imageUrl" TEXT,
  "googleProductId" TEXT,
  "detailToken" TEXT,
  "attributes" JSONB,
  "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "identityExpiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShopperCatalogProduct_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShopperCatalogOffer" (
  "id" TEXT NOT NULL,
  "catalogProductId" TEXT NOT NULL,
  "store" TEXT NOT NULL DEFAULT '',
  "merchant" TEXT,
  "price" DECIMAL(65,30),
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "productUrl" TEXT NOT NULL,
  "availability" TEXT,
  "source" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "priceCheckedAt" TIMESTAMP(3) NOT NULL,
  "offerKey" TEXT NOT NULL,
  CONSTRAINT "ShopperCatalogOffer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShopperCatalogQueryProduct" (
  "queryId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  CONSTRAINT "ShopperCatalogQueryProduct_pkey" PRIMARY KEY ("queryId","productId")
);

CREATE INDEX "ShopperCatalogQuery_userId_intentKey_idx" ON "ShopperCatalogQuery"("userId", "intentKey");
CREATE INDEX "ShopperCatalogQuery_userId_mapExpiresAt_idx" ON "ShopperCatalogQuery"("userId", "mapExpiresAt");
CREATE UNIQUE INDEX "ShopperCatalogProduct_userId_identityKey_key" ON "ShopperCatalogProduct"("userId", "identityKey");
CREATE INDEX "ShopperCatalogProduct_userId_identityExpiresAt_idx" ON "ShopperCatalogProduct"("userId", "identityExpiresAt");
CREATE UNIQUE INDEX "ShopperCatalogOffer_catalogProductId_offerKey_key" ON "ShopperCatalogOffer"("catalogProductId", "offerKey");
CREATE INDEX "ShopperCatalogOffer_priceCheckedAt_idx" ON "ShopperCatalogOffer"("priceCheckedAt");

ALTER TABLE "ShopperCatalogQuery" ADD CONSTRAINT "ShopperCatalogQuery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopperCatalogProduct" ADD CONSTRAINT "ShopperCatalogProduct_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopperCatalogOffer" ADD CONSTRAINT "ShopperCatalogOffer_catalogProductId_fkey" FOREIGN KEY ("catalogProductId") REFERENCES "ShopperCatalogProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopperCatalogQueryProduct" ADD CONSTRAINT "ShopperCatalogQueryProduct_queryId_fkey" FOREIGN KEY ("queryId") REFERENCES "ShopperCatalogQuery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopperCatalogQueryProduct" ADD CONSTRAINT "ShopperCatalogQueryProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ShopperCatalogProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
