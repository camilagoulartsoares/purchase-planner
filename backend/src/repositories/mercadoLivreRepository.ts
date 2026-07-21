import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";

export const mercadoLivreRepository = {
  findIntegrationByUser(userId: string) {
    return prisma.mercadoLivreIntegration.findUnique({
      where: { userId },
    });
  },

  upsertIntegration(userId: string, data: {
    meliUserId: string;
    nickname?: string | null;
    siteId?: string | null;
    accessTokenEncrypted: string;
    refreshTokenEncrypted: string;
    tokenType: string;
    scopes: string;
    tokenExpiresAt: Date;
    lastRefreshedAt?: Date | null;
    syncStatus?: string;
    syncError?: string | null;
  }) {
    return prisma.mercadoLivreIntegration.upsert({
      where: { userId },
      create: {
        user: { connect: { id: userId } },
        ...data,
      },
      update: {
        ...data,
      },
    });
  },

  updateIntegration(userId: string, data: Record<string, unknown>) {
    return prisma.mercadoLivreIntegration.update({
      where: { userId },
      data,
    });
  },

  deleteIntegration(userId: string) {
    return prisma.mercadoLivreIntegration.deleteMany({
      where: { userId },
    });
  },

  createOAuthState(userId: string, state: string, expiresAt: Date, redirectTo?: string | null) {
    return prisma.mercadoLivreOAuthState.create({
      data: {
        userId,
        state,
        expiresAt,
        redirectTo: redirectTo || null,
      },
    });
  },

  consumeOAuthState(state: string) {
    return prisma.$transaction(async (tx) => {
      const record = await tx.mercadoLivreOAuthState.findUnique({
        where: { state },
      });

      if (!record || record.usedAt || record.expiresAt < new Date()) {
        return null;
      }

      return tx.mercadoLivreOAuthState.update({
        where: { state },
        data: { usedAt: new Date() },
      });
    });
  },

  cleanupExpiredStates() {
    return prisma.mercadoLivreOAuthState.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: new Date() } }, { usedAt: { not: null } }],
      },
    });
  },

  listAutoSyncIntegrations() {
    return prisma.mercadoLivreIntegration.findMany({
      where: { autoSyncEnabled: true },
      orderBy: { updatedAt: "asc" },
    });
  },

  findBrandByUserAndName(userId: string, name: string) {
    return prisma.brand.findFirst({
      where: { userId, name },
    });
  },

  findMarketplaceProduct(userId: string, marketplace: string, externalItemId: string) {
    return prisma.product.findFirst({
      where: { userId, marketplace, externalItemId },
      include: { brand: true, images: { orderBy: { position: "asc" } } },
    });
  },

  createPriceHistory(data: {
    productId: string;
    source: string;
    previousPrice?: number | null;
    currentPrice: number;
    originalPrice?: number | null;
    lowestRecordedPrice?: number | null;
    discountPercentage?: number | null;
    availability?: string | null;
    details?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
  }) {
    return prisma.productPriceHistory.create({
      data: {
        ...data,
      },
    });
  },

  findLatestPriceHistory(productId: string) {
    return prisma.productPriceHistory.findFirst({
      where: { productId },
      orderBy: { checkedAt: "desc" },
    });
  },

  createNotification(data: {
    userId: string;
    productId?: string | null;
    type: string;
    dedupeKey: string;
    title: string;
    body: string;
    payload?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
  }) {
    return prisma.userNotification.create({
      data: {
        ...data,
        productId: data.productId || null,
      },
    });
  },

  findNotificationByDedupeKey(dedupeKey: string) {
    return prisma.userNotification.findUnique({
      where: { dedupeKey },
    });
  },
};
