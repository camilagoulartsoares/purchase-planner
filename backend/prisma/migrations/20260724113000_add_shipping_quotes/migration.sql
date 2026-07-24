CREATE TABLE "ShippingQuote" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "cep" TEXT NOT NULL,
    "shippingPrice" DECIMAL(65,30) NOT NULL,
    "deliveryDays" INTEGER,
    "service" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShippingQuote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShippingQuote_productId_cep_key" ON "ShippingQuote"("productId", "cep");
CREATE INDEX "ShippingQuote_cep_checkedAt_idx" ON "ShippingQuote"("cep", "checkedAt");
ALTER TABLE "ShippingQuote" ADD CONSTRAINT "ShippingQuote_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
