import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { evolutionApiService } from "./evolutionApiService.js";
import { shoppingProviders, type ShoppingOffer, type ShoppingProvider } from "./shoppingProviders/index.js";

const blockedProductWords = ["condicionador", "mascara", "máscara", "oleo", "óleo", "miniatura"];
let running = false;

export function isRelevantOffer(term: string, title: string) {
  const queryWords = term.toLocaleLowerCase("pt-BR").split(/\s+/).filter((word) => word.length >= 4);
  const normalizedTitle = title.toLocaleLowerCase("pt-BR");
  if (blockedProductWords.some((word) => normalizedTitle.includes(word) && !queryWords.includes(word))) return false;
  return queryWords.length === 0 || queryWords.filter((word) => normalizedTitle.includes(word)).length >= Math.min(2, queryWords.length);
}

export function isEligibleOffer(offer: ShoppingOffer, maximumTotalPrice: number) {
  return offer.availability === "in_stock" && offer.shipping != null && offer.totalPrice != null && offer.totalPrice <= maximumTotalPrice;
}

export function shouldSendAlert(last: { totalPrice: number; sentAt: Date } | null, offer: ShoppingOffer, cooldownHours: number) {
  if (!last || offer.totalPrice == null) return true;
  if (offer.totalPrice < last.totalPrice) return true;
  return Date.now() - last.sentAt.getTime() >= cooldownHours * 3_600_000 && offer.totalPrice !== last.totalPrice;
}

export async function collectProviderOffers(providers: ShoppingProvider[], searchTerm: string, postalCode: string) {
  const providerResults = await Promise.allSettled(providers.map(async (provider) => {
    if (provider.status !== "operational") return [] as ShoppingOffer[];
    const offers = await provider.search(searchTerm, postalCode);
    console.info(`[promotion.provider] ${provider.id} resultados=${offers.length}`);
    return offers;
  }));
  return providerResults.flatMap((result) => {
    if (result.status === "rejected") { console.warn("[promotion.provider] erro=" + (result.reason instanceof Error ? result.reason.message : String(result.reason))); return []; }
    return result.value.filter((offer) => isRelevantOffer(searchTerm, offer.title));
  });
}

function formatAlert(watchName: string, maximum: number, offer: ShoppingOffer) {
  const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return ["🚨 PROMOÇÃO ENCONTRADA", "", `🧴 ${offer.title}`, `🏪 ${offer.store}`,
    offer.originalPrice ? `De: ${brl(offer.originalPrice)}` : null, `Por: ${brl(offer.price)}`,
    `🚚 Frete: ${brl(offer.shipping!)}`, "", `💰 TOTAL: ${brl(offer.totalPrice!)}`,
    offer.discountPercentage ? `📉 ${offer.discountPercentage}% abaixo do preço original` : null,
    `✅ Dentro da sua meta de ${brl(maximum)} para ${watchName}`, "", "🔗 Ver promoção:", offer.url].filter(Boolean).join("\n");
}

async function checkWatchItem(item: { id: string; userId: string; name: string; searchTerm: string; maximumTotalPrice: unknown }, postalCode: string) {
  const maximum = Number(item.maximumTotalPrice);
  console.info("[promotion.monitor] produto=" + item.name);
  const offers = await collectProviderOffers(shoppingProviders, item.searchTerm, postalCode);
  for (const offer of offers) {
    await prisma.promotionOfferHistory.create({ data: { watchItemId: item.id, store: offer.store, title: offer.title, productPrice: offer.price, shippingPrice: offer.shipping, totalPrice: offer.totalPrice, originalPrice: offer.originalPrice, discountPercentage: offer.discountPercentage, url: offer.url, imageUrl: offer.imageUrl, seller: offer.seller, availability: offer.availability } });
    const eligible = isEligibleOffer(offer, maximum);
    console.info(`[promotion.alert] elegivel=${eligible}`);
    if (!eligible) continue;
    const last = await prisma.promotionAlertHistory.findFirst({ where: { watchItemId: item.id, url: offer.url }, orderBy: { sentAt: "desc" } });
    if (!shouldSendAlert(last ? { totalPrice: Number(last.totalPrice), sentAt: last.sentAt } : null, offer, env.promotion.alertCooldownHours)) continue;
    if (!evolutionApiService.isConfigured()) { console.warn("[promotion.whatsapp] não configurado"); continue; }
    await evolutionApiService.sendTextToRecipient(formatAlert(item.name, maximum, offer));
    await prisma.promotionAlertHistory.create({ data: { watchItemId: item.id, store: offer.store, url: offer.url, totalPrice: offer.totalPrice! } });
    console.info("[promotion.whatsapp] enviado=true");
  }
  await prisma.promotionWatchItem.update({ where: { id: item.id }, data: { lastCheckedAt: new Date() } });
}

export const promotionMonitorService = {
  async runCycle() {
    if (running) { console.info("[promotion.monitor] ciclo ignorado: já em execução"); return; }
    running = true;
    try {
      console.info("[promotion.monitor] iniciando verificação");
      const items = await prisma.promotionWatchItem.findMany({ where: { active: true }, include: { user: { include: { promotionSettings: true } } } });
      for (const item of items) {
        const postalCode = item.user.promotionSettings?.shippingPostalCode;
        if (!postalCode) { console.warn("[promotion.monitor] CEP ausente", { watchItemId: item.id }); continue; }
        try { await checkWatchItem(item, postalCode); } catch (error) { console.error("[promotion.monitor] falha", { watchItemId: item.id, message: error instanceof Error ? error.message : String(error) }); }
      }
    } finally { running = false; }
  },
};
