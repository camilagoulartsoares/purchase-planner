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
  statusLabel: string;
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
      reason: item.reason ?? item.evidence[0] ?? null,
      salePrice: item.salePrice ?? null,
      originalPrice: item.originalPrice ?? null,
      discountPercentage: item.discountPercentage ?? null,
      pixPrice: item.pixPrice ?? null,
      checkedAt: item.checkedAt ?? null,
      status: item.status,
      statusLabel: statusLabelFor(item),
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
