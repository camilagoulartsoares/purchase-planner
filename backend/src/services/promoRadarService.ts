import { productRepository, type ProductWithRelations } from "../repositories/productRepository.js";

type RadarProduct = {
  productId: string;
  name: string;
  brand: string;
  brandSlug: string;
  productUrl: string;
  imageUrl?: string | null;
  currentPrice?: number | null;
  referencePrice?: number | null;
  matchedTerms: string[];
  reason: string;
};

type RadarBrand = {
  brandId: string;
  brand: string;
  storeDomain: string;
  headline: string;
  detectedAt: string;
  campaignUrls: string[];
  matchedProducts: RadarProduct[];
};

type CacheEntry = {
  expiresAt: number;
  data: RadarBrand[];
};

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 1000 * 60 * 20;
const MAX_PRODUCTS_TO_SCAN = 120;
const PROMO_TERMS = [
  "promo",
  "promoção",
  "promocao",
  "oferta",
  "sale",
  "liquida",
  "liquidação",
  "liquidacao",
  "queima",
  "troca de coleção",
  "troca de colecao",
  "semana d",
  "desconto",
  "black",
  "off",
];
const CAMPAIGN_PATH_TERMS = ["semana", "sale", "promo", "oferta", "liquida", "black"];

function domainFrom(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function normalizeUrl(raw: string) {
  const url = new URL(raw);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^utm_/i.test(key)) url.searchParams.delete(key);
  }
  const normalized = url.toString();
  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

function productImage(product: ProductWithRelations) {
  const main = product.images.find((image) => image.isMain) || product.images[0];
  return main?.imageUrl || product.imageUrl;
}

function decodeMoney(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractMoneyValues(html: string) {
  const matches = [...html.matchAll(/R\$\s*([\d.]+,\d{2})/gi)];
  return matches
    .map((match) => decodeMoney(match[1]))
    .filter((value): value is number => value != null);
}

function extractDiscountSignals(html: string) {
  const offMatches = [...html.matchAll(/(\d{1,2})%\s*OFF/gi)].map(
    (match) => `${match[1]}%-off`,
  );
  const pixMatches = [...html.matchAll(/PIX\s*\(-?(\d{1,2})%\)/gi)].map(
    (match) => `pix-${match[1]}%-off`,
  );

  return [...new Set([...offMatches, ...pixMatches])];
}

function extractPromoTerms(html: string) {
  const lowered = html.toLowerCase();
  return PROMO_TERMS.filter((term) => lowered.includes(term));
}

function extractCampaignUrlsFromSitemap(xml: string, domain: string) {
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)]
    .map((match) => match[1].trim())
    .filter((url) => domainFrom(url) === domain)
    .filter((url) =>
      CAMPAIGN_PATH_TERMS.some((term) => url.toLowerCase().includes(`/${term}`) || url.toLowerCase().includes(`-${term}`)),
    );

  return [...new Set(urls)].slice(0, 5);
}

async function fetchText(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      signal: controller.signal,
    });

    const text = await response.text();
    return response.ok || text ? text : "";
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

async function inspectProduct(product: ProductWithRelations) {
  if (!product.purchaseUrl) return null;

  const url = normalizeUrl(product.purchaseUrl);
  const html = await fetchText(url);
  if (!html) return null;

  const moneyValues = extractMoneyValues(html);
  const discountSignals = extractDiscountSignals(html);
  const pageLowestPrice = moneyValues.length ? Math.min(...moneyValues) : null;
  const pageReferencePrice =
    moneyValues.length > 1 ? Math.max(...moneyValues) : product.promotionalPrice != null ? Number(product.originalPrice) : null;
  const terms = extractPromoTerms(html);
  const campaignImageSignal =
    /queima[oã]-de-estoque|troca-de-cole[cç][aã]o|semana-\d|stories/i.test(html);

  const knownCurrentPrice =
    product.promotionalPrice != null ? Number(product.promotionalPrice) : Number(product.originalPrice);
  const knownReferencePrice = Number(product.originalPrice);
  const pageHasBetterPrice = pageLowestPrice != null && pageLowestPrice + 0.01 < knownCurrentPrice;
  const pageShowsDiscount = pageReferencePrice != null && pageLowestPrice != null && pageLowestPrice + 0.01 < pageReferencePrice;
  const isPromo =
    campaignImageSignal ||
    terms.length > 0 ||
    discountSignals.length > 0 ||
    pageHasBetterPrice ||
    pageShowsDiscount;

  if (!isPromo) return null;

  const matchedTerms = [
    ...terms,
    ...discountSignals,
    ...(campaignImageSignal ? ["campanha-semanal"] : []),
    ...(pageHasBetterPrice ? ["preco-menor-no-site"] : []),
    ...(pageShowsDiscount ? ["desconto-no-html"] : []),
  ];

  return {
    productId: product.id,
    name: product.name,
    brand: product.brand.name,
    brandSlug: product.brand.slug,
    productUrl: url,
    imageUrl: productImage(product),
    currentPrice: pageLowestPrice ?? knownCurrentPrice,
    referencePrice:
      pageReferencePrice != null && pageReferencePrice > (pageLowestPrice ?? 0)
        ? pageReferencePrice
        : knownReferencePrice,
    matchedTerms,
    reason: campaignImageSignal
      ? "A página do produto está apontando para uma campanha semanal ativa."
      : pageHasBetterPrice || pageShowsDiscount
        ? "O site mostra preço/promessa de desconto melhor do que a referência salva."
        : "A página contém sinais reais de promoção nesta semana.",
  } satisfies RadarProduct;
}

export const promoRadarService = {
  async weeklyBrandPromotions(userId: string) {
    const cached = cache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    const products = await productRepository.findAllByUser(userId);
    const eligibleProducts = products
      .filter((product) => product.purchaseUrl)
      .filter((product) => product.status !== "Desisti da compra")
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, MAX_PRODUCTS_TO_SCAN);

    const domainCampaigns = new Map<string, string[]>();
    for (const product of eligibleProducts) {
      const domain = domainFrom(String(product.purchaseUrl));
      if (!domain || domainCampaigns.has(domain)) continue;

      const sitemap = await fetchText(`https://${domain}/sitemap.xml`);
      if (!sitemap) continue;
      domainCampaigns.set(domain, extractCampaignUrlsFromSitemap(sitemap, domain));
    }

    const inspected = await Promise.all(eligibleProducts.map((product) => inspectProduct(product)));
    const hits = inspected.filter((item): item is RadarProduct => item != null);

    const grouped = new Map<string, RadarBrand>();
    for (const hit of hits) {
      const product = eligibleProducts.find((item) => item.id === hit.productId);
      if (!product) continue;

      const domain = domainFrom(hit.productUrl);
      const existing = grouped.get(product.brandId);
      if (existing) {
        existing.matchedProducts.push(hit);
        continue;
      }

      grouped.set(product.brandId, {
        brandId: product.brandId,
        brand: product.brand.name,
        storeDomain: domain,
        headline: "",
        detectedAt: new Date().toISOString(),
        campaignUrls: domainCampaigns.get(domain) || [],
        matchedProducts: [hit],
      });
    }

    const result = [...grouped.values()]
      .map((brand) => {
        const itemCount = brand.matchedProducts.length;
        const productLabel = itemCount === 1 ? "peça" : "peças";
        brand.headline =
          itemCount >= 3
            ? `${brand.brand} está com ${itemCount} ${productLabel} em promoção nesta semana.`
            : itemCount >= 1
              ? `${brand.brand} tem ${itemCount} ${productLabel} com sinal real de promoção agora.`
              : `${brand.brand} sem promoção detectada.`;
        brand.matchedProducts = brand.matchedProducts.slice(0, 6);
        return brand;
      })
      .sort((a, b) => b.matchedProducts.length - a.matchedProducts.length);

    cache.set(userId, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      data: result,
    });

    return result;
  },
};
