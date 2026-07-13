-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "store" TEXT NOT NULL,
    "originalPrice" DECIMAL(12,2) NOT NULL,
    "promotionalPrice" DECIMAL(12,2),
    "purchaseUrl" TEXT,
    "imageUrl" TEXT,
    "imagePublicId" TEXT,
    "color" TEXT,
    "size" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'Quero',
    "status" TEXT NOT NULL DEFAULT 'Quero comprar',
    "notes" TEXT,
    "purchasedPrice" DECIMAL(12,2),
    "purchasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Product_userId_idx" ON "Product"("userId");

-- CreateIndex
CREATE INDEX "Product_userId_status_idx" ON "Product"("userId", "status");

-- CreateIndex
CREATE INDEX "Product_userId_category_idx" ON "Product"("userId", "category");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
