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
  "promocao",
  "oferta",
  "sale",
  "liquida",
  "liquidacao",
  "queima",
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

function decodeCents(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed / 100 : null;
}

function extractMoneyValues(html: string) {
  const matches = [...html.matchAll(/R\$\s*([\d.]+,\d{2})/gi)];
  return matches
    .map((match) => decodeMoney(match[1]))
    .filter((value): value is number => value != null);
}

export function extractStructuredPriceData(html: string) {
  const compareDom = html.match(
    /<del[^>]*data-total-compare-price[^>]*>\s*R\$\s*([\d.]+,\d{2})\s*<\/del>/i,
  );
  const currentDom = html.match(
    /<ins[^>]*data-total-price[^>]*>\s*R\$\s*([\d.]+,\d{2})\s*<\/ins>/i,
  );

  if (currentDom?.[1] || compareDom?.[1]) {
    return {
      currentPrice: currentDom?.[1] ? decodeMoney(currentDom[1]) : null,
      referencePrice: compareDom?.[1] ? decodeMoney(compareDom[1]) : null,
    };
  }

  const compareJson = html.match(/"compare_at_price"\s*:\s*(\d{3,})/i);
  const currentJson = html.match(/"price"\s*:\s*(\d{3,})/i);

  if (currentJson?.[1] || compareJson?.[1]) {
    return {
      currentPrice: currentJson?.[1] ? decodeCents(currentJson[1]) : null,
      referencePrice: compareJson?.[1] ? decodeCents(compareJson[1]) : null,
    };
  }

  const ogCurrent = html.match(
    /<meta[^>]+property=["']og:price:amount["'][^>]+content=["']([\d.]+,\d{2})["']/i,
  );
  const ldCurrent = html.match(/"price"\s*:\s*"(\d+\.\d{2})"/i);

  return {
    currentPrice: ogCurrent?.[1]
      ? decodeMoney(ogCurrent[1])
      : ldCurrent?.[1]
        ? Number(ldCurrent[1])
        : null,
    referencePrice: null,
  };
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
      CAMPAIGN_PATH_TERMS.some(
        (term) =>
          url.toLowerCase().includes(`/${term}`) || url.toLowerCase().includes(`-${term}`),
      ),
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

async function inspectProduct(product: ProductWithRelations): Promise<RadarProduct | null> {
  if (!product.purchaseUrl) return null;

  const url = normalizeUrl(product.purchaseUrl);
  const html = await fetchText(url);
  if (!html) return null;

  const knownCurrentPrice =
    product.promotionalPrice != null ? Number(product.promotionalPrice) : Number(product.originalPrice);
  const knownReferencePrice = Number(product.originalPrice);
  const structuredPrices = extractStructuredPriceData(html);
  const moneyValues = extractMoneyValues(html);
  const discountSignals = extractDiscountSignals(html);
  const pageLowestPrice =
    structuredPrices.currentPrice != null
      ? structuredPrices.currentPrice
      : moneyValues.length
        ? Math.min(...moneyValues)
        : null;
  const pageReferencePrice =
    structuredPrices.referencePrice != null
      ? structuredPrices.referencePrice
      : structuredPrices.currentPrice != null
        ? knownReferencePrice
        : moneyValues.length > 1
          ? Math.max(...moneyValues)
          : knownReferencePrice;
  const terms = extractPromoTerms(html);
  const campaignImageSignal =
    /queima-de-estoque|troca-de-colecao|semana-\d|stories/i.test(html);

  const pageHasBetterPrice = pageLowestPrice != null && pageLowestPrice + 0.01 < knownCurrentPrice;
  const pageShowsDiscount =
    pageReferencePrice != null &&
    pageLowestPrice != null &&
    pageLowestPrice + 0.01 < pageReferencePrice;
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
    imageUrl: productImage(product) ?? null,
    currentPrice: pageLowestPrice ?? knownCurrentPrice,
    referencePrice:
      pageReferencePrice != null && pageReferencePrice > (pageLowestPrice ?? 0)
        ? pageReferencePrice
        : knownReferencePrice,
    matchedTerms,
    reason: campaignImageSignal
      ? "A pagina do produto esta apontando para uma campanha semanal ativa."
      : pageHasBetterPrice || pageShowsDiscount
        ? "O site mostra preco/promessa de desconto melhor do que a referencia salva."
        : "A pagina contem sinais reais de promocao nesta semana.",
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

    const inspected = await Promise.all(
      eligibleProducts.map((product) => inspectProduct(product)),
    );
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
        const productLabel = itemCount === 1 ? "peca" : "pecas";
        brand.headline =
          itemCount >= 3
            ? `${brand.brand} esta com ${itemCount} ${productLabel} em promocao nesta semana.`
            : itemCount >= 1
              ? `${brand.brand} tem ${itemCount} ${productLabel} com sinal real de promocao agora.`
              : `${brand.brand} sem promocao detectada.`;
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
