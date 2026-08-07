-- Personal Shopper: histórico leve, contexto e resultados normalizados por conversa.
ALTER TABLE "Finding" ADD COLUMN "provider" TEXT;
ALTER TABLE "Finding" ADD COLUMN "foundAt" TIMESTAMP(3);

CREATE TABLE "ShopperConversation" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT,
  "context" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShopperConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShopperMessage" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "structuredData" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShopperMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShopperSearch" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "query" JSONB NOT NULL,
  "results" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  CONSTRAINT "ShopperSearch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ShopperConversation_userId_updatedAt_idx" ON "ShopperConversation"("userId", "updatedAt");
CREATE INDEX "ShopperMessage_conversationId_createdAt_idx" ON "ShopperMessage"("conversationId", "createdAt");
CREATE INDEX "ShopperSearch_conversationId_createdAt_idx" ON "ShopperSearch"("conversationId", "createdAt");

ALTER TABLE "ShopperConversation" ADD CONSTRAINT "ShopperConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopperMessage" ADD CONSTRAINT "ShopperMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ShopperConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopperSearch" ADD CONSTRAINT "ShopperSearch_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ShopperConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
