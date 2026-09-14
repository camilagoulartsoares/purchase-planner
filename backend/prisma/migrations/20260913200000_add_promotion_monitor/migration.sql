CREATE TABLE "PromotionSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shippingPostalCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PromotionSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PromotionWatchItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "searchTerm" TEXT NOT NULL,
    "maximumTotalPrice" DECIMAL(65,30) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PromotionWatchItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PromotionOfferHistory" (
    "id" TEXT NOT NULL,
    "watchItemId" TEXT NOT NULL,
    "store" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "productPrice" DECIMAL(65,30) NOT NULL,
    "shippingPrice" DECIMAL(65,30),
    "totalPrice" DECIMAL(65,30),
    "originalPrice" DECIMAL(65,30),
    "discountPercentage" INTEGER,
    "url" TEXT NOT NULL,
    "imageUrl" TEXT,
    "seller" TEXT,
    "availability" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromotionOfferHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PromotionAlertHistory" (
    "id" TEXT NOT NULL,
    "watchItemId" TEXT NOT NULL,
    "store" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "totalPrice" DECIMAL(65,30) NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromotionAlertHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PromotionSettings_userId_key" ON "PromotionSettings"("userId");
CREATE INDEX "PromotionWatchItem_userId_active_idx" ON "PromotionWatchItem"("userId", "active");
CREATE INDEX "PromotionOfferHistory_watchItemId_checkedAt_idx" ON "PromotionOfferHistory"("watchItemId", "checkedAt");
CREATE INDEX "PromotionOfferHistory_watchItemId_url_idx" ON "PromotionOfferHistory"("watchItemId", "url");
CREATE INDEX "PromotionAlertHistory_watchItemId_url_sentAt_idx" ON "PromotionAlertHistory"("watchItemId", "url", "sentAt");
ALTER TABLE "PromotionSettings" ADD CONSTRAINT "PromotionSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromotionWatchItem" ADD CONSTRAINT "PromotionWatchItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromotionOfferHistory" ADD CONSTRAINT "PromotionOfferHistory_watchItemId_fkey" FOREIGN KEY ("watchItemId") REFERENCES "PromotionWatchItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromotionAlertHistory" ADD CONSTRAINT "PromotionAlertHistory_watchItemId_fkey" FOREIGN KEY ("watchItemId") REFERENCES "PromotionWatchItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
