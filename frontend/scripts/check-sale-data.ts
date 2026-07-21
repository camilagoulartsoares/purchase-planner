import { formatBRL, type PromoRadarResponse } from "../src/types";
import { buildPromoByProductId, hasLivePromoPrice } from "../src/utils/promo";

const productId = "cmrtqas5u0000hl1j9ykw16tv";

const radar: PromoRadarResponse = {
  generatedAt: "2026-07-21T02:00:00.000Z",
  products: [
    {
      productId,
      productName: "Legging Detalhes - Preto",
      productBrand: "Cha Matte",
      imageUrl:
        "https://res.cloudinary.com/tqf5ecxg/image/upload/v1784582424/closet-sonhos/y5hog5zr6jgxhrwyt0ll.webp",
      purchaseUrl: "https://www.chamatte.com.br/products/legging-detalhes-preto",
      normalizedPurchaseUrl: "https://chamatte.com.br/products/legging-detalhes-preto",
      finalUrl: "https://www.chamatte.com.br/products/legging-detalhes-preto/",
      productMatched: true,
      matchConfidence: 0.95,
      isOnSale: true,
      autoDisplayEligible: true,
      originalPrice: 170,
      salePrice: 156.92,
      discountPercentage: 8,
      pixPrice: 149.07,
      currency: "BRL",
      availability: "in_stock",
      variationAnalyzed: "Preto / P",
      evidence: [
        "Preco original riscado na pagina",
        "Preco atual menor que o preco original",
        "Texto 8% OFF encontrado",
      ],
      status: "ok",
      reason: "Promocao confirmada com evidencia concreta",
      checkedAt: "2026-07-21T02:00:00.000Z",
      logs: [],
      conditionalOffers: [
        {
          type: "pix",
          price: 149.07,
          label: "PIX",
          condition: "R$ 149,07 com PIX (-5%)",
        },
      ],
      pageTitle: "Legging Detalhes Preto",
      matchedFieldScores: {
        name: 0.92,
        brand: 1,
        color: 1,
        size: 1,
      },
    },
  ],
  brands: [],
};

const promo = buildPromoByProductId(radar.products).get(productId) ?? null;
const usesSaleDisplay = hasLivePromoPrice(promo?.salePrice, promo?.originalPrice);

console.log(
  JSON.stringify(
    {
      mappedByProductId: Boolean(promo),
      promoLabel: promo?.label ?? null,
      usesSaleDisplay,
      oldPrice: promo?.originalPrice != null ? formatBRL(promo.originalPrice) : null,
      currentPrice: promo?.salePrice != null ? formatBRL(promo.salePrice) : null,
      pixPrice: promo?.pixPrice != null ? formatBRL(promo.pixPrice) : null,
      statusLabel: promo?.statusLabel ?? null,
    },
    null,
    2,
  ),
);
