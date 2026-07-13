-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "store" TEXT NOT NULL,
    "originalPrice" DECIMAL NOT NULL,
    "promotionalPrice" DECIMAL,
    "purchaseUrl" TEXT,
    "imageUrl" TEXT,
    "imagePublicId" TEXT,
    "color" TEXT,
    "size" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'Quero',
    "status" TEXT NOT NULL DEFAULT 'Quero comprar',
    "notes" TEXT,
    "purchasedPrice" DECIMAL,
    "purchasedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Product_userId_idx" ON "Product"("userId");

-- CreateIndex
CREATE INDEX "Product_userId_status_idx" ON "Product"("userId", "status");

-- CreateIndex
CREATE INDEX "Product_userId_category_idx" ON "Product"("userId", "category");
