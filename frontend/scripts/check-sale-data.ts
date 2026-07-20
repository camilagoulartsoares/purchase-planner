import { formatBRL } from "../src/types";
import { buildPromoByProductId, hasLivePromoPrice } from "../src/utils/promo";

const productId = "cmrtqas5u0000hl1j9ykw16tv";

const radar = [
  {
    brandId: "cmrje59pd000cho210kxtejz6",
    brand: "Cha Matte",
    storeDomain: "chamatte.com.br",
    headline: "Cha Matte tem 1 peça com sinal real de promoção agora.",
    detectedAt: "2026-07-20T21:50:51.537Z",
    campaignUrls: [],
    matchedProducts: [
      {
        productId,
        name: "Legging Detalhes - Preto",
        brand: "Cha Matte",
        brandSlug: "cha-matte",
        productUrl: "https://www.chamatte.com.br/products/legging-detalhes-preto/",
        imageUrl:
          "https://res.cloudinary.com/tqf5ecxg/image/upload/v1784582424/closet-sonhos/y5hog5zr6jgxhrwyt0ll.webp",
        currentPrice: 156.92,
        referencePrice: 170,
        matchedTerms: ["8%-off", "desconto-no-html"],
        reason: "O site mostra preço/promessa de desconto melhor do que a referência salva.",
      },
    ],
  },
];

const promo = buildPromoByProductId(radar).get(productId) ?? null;
const usesSaleDisplay = hasLivePromoPrice(promo?.currentPrice, promo?.referencePrice);

console.log(
  JSON.stringify(
    {
      mappedByProductId: Boolean(promo),
      promoLabel: promo?.label ?? null,
      usesSaleDisplay,
      oldPrice: promo?.referencePrice != null ? formatBRL(promo.referencePrice) : null,
      currentPrice: promo?.currentPrice != null ? formatBRL(promo.currentPrice) : null,
    },
    null,
    2,
  ),
);
