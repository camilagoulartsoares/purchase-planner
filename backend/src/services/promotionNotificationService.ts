import { prisma } from "../config/prisma.js";
import { mercadoLivreRepository } from "../repositories/mercadoLivreRepository.js";
import { promoRadarService } from "./promoRadarService.js";
import { evolutionApiService } from "./evolutionApiService.js";

const MARKETPLACE = "mercado_livre";

async function deliver(
  notification: { id: string },
  promotion: { productName: string; currentPrice: number; targetPrice: number | null; purchaseUrl: string },
  shouldSend: boolean,
) {
  if (!shouldSend || !evolutionApiService.isConfigured()) return;
  try {
    await evolutionApiService.sendPromotion(promotion);
    await mercadoLivreRepository.updateWhatsAppDelivery(notification.id, {
      status: "sent",
      sentAt: new Date(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Falha desconhecida ao enviar WhatsApp";
    await mercadoLivreRepository.updateWhatsAppDelivery(notification.id, {
      status: "failed",
      error: message,
    });
    console.warn("[whatsapp.evolution] entrega do Radar pendente para nova tentativa", {
      notificationId: notification.id,
      message,
    });
  }
}

async function scanUser(userId: string) {
  const products = await prisma.product.findMany({
    where: {
      userId,
      purchaseUrl: { not: null },
      marketplace: { not: MARKETPLACE },
      status: { notIn: ["Já comprei", "Desisti da compra"] },
    },
    select: { id: true, targetPrice: true },
  });
  if (!products.length) return;

  const tracked = new Map(products.map((product) => [product.id, product]));
  // Usa o mesmo Radar que a Home: promoção só é elegível quando a página confirma
  // produto, disponibilidade e preço promocional com confiança suficiente.
  const radar = await promoRadarService.weeklyBrandPromotions(userId, true);

  for (const result of radar.products) {
    const product = tracked.get(result.productId);
    if (!product || !result.autoDisplayEligible || result.salePrice == null || !result.purchaseUrl) continue;

    const targetPrice = product.targetPrice == null ? null : Number(product.targetPrice);
    const dedupeKey = `radar:${result.productId}:promo:${result.salePrice}:${result.originalPrice ?? "unknown"}`;
    const existing = await mercadoLivreRepository.findNotificationByDedupeKey(dedupeKey);
    const promotion = {
      productName: result.productName,
      currentPrice: result.salePrice,
      targetPrice,
      purchaseUrl: result.purchaseUrl,
    };

    if (existing) {
      await deliver(existing, promotion, existing.whatsappStatus === "failed");
      continue;
    }

    const notification = await mercadoLivreRepository.createNotification({
      userId,
      productId: result.productId,
      type: targetPrice != null && result.salePrice <= targetPrice ? "target_price_reached" : "promotion_detected",
      dedupeKey,
      title: `${result.productName} entrou em promoção`,
      body: `Preço atual: ${result.salePrice}`,
      payload: {
        source: "promo_radar",
        purchaseUrl: result.purchaseUrl,
        originalPrice: result.originalPrice,
        currentPrice: result.salePrice,
        targetPrice,
        discountPercentage: result.discountPercentage,
        confidence: result.matchConfidence,
      },
      whatsappStatus: evolutionApiService.isConfigured() ? "pending" : "not_configured",
    });
    await deliver(notification, promotion, true);
  }
}

export const promotionNotificationService = {
  async runAutoScanCycle() {
    if (!evolutionApiService.isConfigured()) return;

    const users = await prisma.product.findMany({
      where: {
        purchaseUrl: { not: null },
        marketplace: { not: MARKETPLACE },
        status: { notIn: ["Já comprei", "Desisti da compra"] },
      },
      distinct: ["userId"],
      select: { userId: true },
    });

    for (const { userId } of users) {
      try {
        await scanUser(userId);
      } catch (error) {
        console.error("[promotion.monitor] falha ao verificar promoções", {
          userId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  },
};
