import type { PromoRadarBrand } from "../types";

export type PromoLookup = {
  label: string;
  reason: string;
  currentPrice: number | null;
  referencePrice: number | null;
};

export function buildPromoByProductId(promoRadar: PromoRadarBrand[]) {
  const map = new Map<string, PromoLookup>();

  for (const brand of promoRadar) {
    for (const item of brand.matchedProducts) {
      map.set(item.productId, {
        label:
          item.referencePrice != null &&
          item.currentPrice != null &&
          item.currentPrice < item.referencePrice
            ? "SALE"
            : "PROMO",
        reason: item.reason,
        currentPrice: item.currentPrice ?? null,
        referencePrice: item.referencePrice ?? null,
      });
    }
  }

  return map;
}

export function hasLivePromoPrice(
  promoCurrentPrice?: number | null,
  promoReferencePrice?: number | null,
) {
  return (
    promoCurrentPrice != null &&
    promoReferencePrice != null &&
    promoCurrentPrice < promoReferencePrice
  );
}
