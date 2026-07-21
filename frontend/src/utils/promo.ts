import type { PromoRadarProduct } from "../types";

export type PromoLookup = {
  label: string | null;
  reason: string | null;
  salePrice: number | null;
  originalPrice: number | null;
  discountPercentage: number | null;
  pixPrice: number | null;
  checkedAt: string | null;
  status: string;
  statusLabel: string | null;
  confidence: number;
  productMatched: boolean;
};

export function buildPromoByProductId(products: PromoRadarProduct[]) {
  const map = new Map<string, PromoLookup>();

  for (const item of products) {
    const saleConfirmed =
      item.autoDisplayEligible &&
      item.productMatched &&
      item.originalPrice != null &&
      item.salePrice != null &&
      item.salePrice < item.originalPrice;

    map.set(item.productId, {
      label: saleConfirmed ? "SALE" : null,
      reason: saleConfirmed ? item.reason ?? item.evidence[0] ?? null : null,
      salePrice: saleConfirmed ? item.salePrice ?? null : null,
      originalPrice: saleConfirmed ? item.originalPrice ?? null : null,
      discountPercentage: saleConfirmed ? item.discountPercentage ?? null : null,
      pixPrice: saleConfirmed ? item.pixPrice ?? null : null,
      checkedAt: saleConfirmed ? item.checkedAt ?? null : null,
      status: item.status,
      statusLabel: saleConfirmed ? statusLabelFor(item) : null,
      confidence: item.matchConfidence,
      productMatched: item.productMatched,
    });
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

function statusLabelFor(item: PromoRadarProduct) {
  if (item.autoDisplayEligible) return "Promocao confirmada";
  switch (item.status) {
    case "product_mismatch":
      return "Radar nao confirmou que a pagina e do produto";
    case "page_unavailable":
      return "Pagina indisponivel";
    case "access_blocked":
      return "Loja bloqueou a leitura";
    case "price_not_found":
      return "Preco principal nao encontrado";
    case "out_of_stock":
      return "Produto esgotado";
    case "analysis_failed":
      return "Falha na varredura";
    case "ok":
    default:
      return "Promocao nao confirmada";
  }
}
