import { productRepository, type ProductWithRelations } from "../repositories/productRepository.js";

export const PROMO_MATCH_CONFIDENCE_THRESHOLD = 0.55;

export type PromoRadarStatus =
  | "ok"
  | "page_unavailable"
  | "access_blocked"
  | "product_mismatch"
  | "price_not_found"
  | "out_of_stock"
  | "analysis_failed";

export type PromoRadarAvailability =
  | "in_stock"
  | "out_of_stock"
  | "preorder"
  | "unknown";

export type ConditionalOffer = {
  type: "pix" | "coupon" | "payment_method";
  price: number;
  label: string;
  condition: string;
};

export type ProductPromoRadarResult = {
  productId: string;
  productName: string;
  productBrand: string;
  imageUrl: string | null;
  purchaseUrl: string | null;
  normalizedPurchaseUrl: string | null;
  finalUrl: string | null;
  productMatched: boolean;
  matchConfidence: number;
  isOnSale: boolean;
  autoDisplayEligible: boolean;
  originalPrice: number | null;
  salePrice: number | null;
  discountPercentage: number | null;
  pixPrice: number | null;
  currency: string;
  availability: PromoRadarAvailability;
  variationAnalyzed: string | null;
  evidence: string[];
  status: PromoRadarStatus;
  reason: string | null;
  checkedAt: string;
  logs: string[];
  conditionalOffers: ConditionalOffer[];
  pageTitle: string | null;
  matchedFieldScores: Partial<Record<"name" | "brand" | "category" | "color" | "size" | "sku" | "image", number>>;
};

export type PromoRadarBrandSummary = {
  brandId: string;
  brand: string;
  storeDomain: string;
  headline: string;
  detectedAt: string;
  campaignUrls: string[];
  matchedProducts: ProductPromoRadarResult[];
};

export type ExternalPromotion = {
  id: string;
  brand: string;
  name: string;
  category: string;
  color: string | null;
  purchaseUrl: string;
  originalPrice: number;
  salePrice: number;
  discountPercentage: number;
  imageUrl: string | null;
  detectedAt: string;
};

export type PromoRadarResponse = {
  generatedAt: string;
  products: ProductPromoRadarResult[];
  brands: PromoRadarBrandSummary[];
  externalPromotions: ExternalPromotion[];
};

type CacheEntry = {
  expiresAt: number;
  data: PromoRadarResponse;
};

type PromoRadarExecution = Promise<PromoRadarResponse>;

type FetchPageResult = {
  url: string;
  finalUrl: string;
  normalizedUrl: string;
  statusCode: number;
  html: string;
  blocked: boolean;
  unavailable: boolean;
  redirected: boolean;
  source?: "html" | "shopify_json";
};

type PageProductData = {
  name: string | null;
  brand: string | null;
  category: string | null;
  color: string | null;
  size: string | null;
  sku: string | null;
  description: string | null;
  title: string | null;
  imageUrls: string[];
  currency: string | null;
  availability: PromoRadarAvailability;
  prices: {
    current: number | null;
    original: number | null;
    evidence: string[];
    variantLabel: string | null;
  };
  conditionalOffers: ConditionalOffer[];
  visibleText: string;
};

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, PromoRadarExecution>();
const CACHE_TTL_MS = 1000 * 60 * 20;
const MAX_PRODUCTS_TO_SCAN = 120;
const PRODUCT_SCAN_CONCURRENCY = 4;
const DOMAIN_SCAN_CONCURRENCY = 2;
const PROMO_RADAR_TIMEOUT_MS = 25000;
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
  "off",
];
const TRACKING_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
  "igshid",
  "ref",
  "source",
];
const CAMPAIGN_PATH_TERMS = ["semana", "sale", "promo", "oferta", "liquida", "black"];

function nowIso() {
  return new Date().toISOString();
}

function deadlineFromNow(ms: number) {
  return Date.now() + ms;
}

function isDeadlineExceeded(deadline: number) {
  return Date.now() >= deadline;
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number | null) {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function percentOff(original: number | null, sale: number | null) {
  if (original == null || sale == null || sale >= original || original <= 0) return null;
  return Math.round(((original - sale) / original) * 100);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
) {
  if (!items.length) return [] as R[];
  const size = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<R>(items.length);
  let cursor = 0;

  await Promise.all(
    Array.from({ length: size }, async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) return;
        results[index] = await mapper(items[index], index);
      }
    }),
  );

  return results;
}

export function domainFrom(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

export function normalizeUrl(raw: string) {
  try {
    const url = new URL(raw);
    url.hash = "";
    url.protocol = "https:";
    url.hostname = url.hostname.replace(/^www\./i, "").toLowerCase();
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.includes(key.toLowerCase()) || /^utm_/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    const normalized = url.toString().replace(/\/$/, "");
    return normalized;
  } catch {
    return raw.trim();
  }
}

function productImage(product: ProductWithRelations) {
  const main = product.images.find((image) => image.isMain) || product.images[0];
  return main?.imageUrl || product.imageUrl || null;
}

function decodeMoney(value: string) {
  const normalized = value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function decodeCents(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed / 100 : null;
}

function stripDiacritics(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeText(value: string | null | undefined) {
  return stripDiacritics(String(value || ""))
    .toLowerCase()
    .replace(/&amp;/g, " e ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string | null | undefined) {
  return normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function similarityByTokens(left: string | null | undefined, right: string | null | undefined) {
  const a = new Set(tokenize(left));
  const b = new Set(tokenize(right));
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

function includesLoose(haystack: string | null | undefined, needle: string | null | undefined) {
  const left = normalizeText(haystack);
  const right = normalizeText(needle);
  return Boolean(left && right && (left.includes(right) || right.includes(left)));
}

function titleCaseWords(value: string | null | undefined) {
  if (!value) return null;
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function extractMetaContent(html: string, attribute: string, name: string) {
  const pattern = new RegExp(
    `<meta[^>]+${attribute}=["']${name}["'][^>]+content=["']([^"']+)["']`,
    "i",
  );
  return html.match(pattern)?.[1]?.trim() || null;
}

function extractTitle(html: string) {
  return html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || null;
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteUrl(baseUrl: string, maybeRelative: string | null | undefined) {
  if (!maybeRelative) return null;
  try {
    return new URL(maybeRelative, baseUrl).toString();
  } catch {
    return null;
  }
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function escapeHtml(value: string | null | undefined) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function extractAllMoney(html: string) {
  const matches = [...html.matchAll(/R\$\s*([\d.]+,\d{2})/gi)];
  return matches
    .map((match) => decodeMoney(match[1]))
    .filter((value): value is number => value != null);
}

function looksLikeShopifyProductUrl(url: string) {
  try {
    const parsed = new URL(url);
    return /^\/products\/[^/?#]+/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

function shopifyProductJsonUrl(url: string) {
  const parsed = new URL(url);
  const match = parsed.pathname.match(/^\/products\/([^/?#]+)/i);
  if (!match?.[1]) return null;
  return new URL(`/products/${match[1]}.js`, `${parsed.protocol}//${parsed.host}`).toString();
}

export function buildShopifyHtmlFromJson(baseUrl: string, payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const product = payload as Record<string, unknown>;
  const title = String(product.title || "").trim();
  if (!title) return null;

  const vendor = String(product.vendor || "").trim();
  const productType = String(product.type || "").trim();
  const body = String(product.body_html || "").trim();
  const images = Array.isArray(product.images)
    ? product.images
        .map((item) => {
          if (typeof item === "string") return item;
          if (item && typeof item === "object" && "src" in item) {
            return String((item as { src?: unknown }).src || "");
          }
          return "";
        })
        .filter(Boolean)
    : [];

  const variants = Array.isArray(product.variants)
    ? product.variants.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    : [];
  const firstAvailable =
    variants.find((variant) => Boolean(variant.available)) ||
    variants[0] ||
    null;

  const currentPriceCents = Number(firstAvailable?.price ?? product.price ?? 0);
  const compareAtCents = Number(firstAvailable?.compare_at_price ?? product.compare_at_price ?? 0);
  const currentPrice = Number.isFinite(currentPriceCents) && currentPriceCents > 0 ? currentPriceCents / 100 : null;
  const compareAtPrice =
    Number.isFinite(compareAtCents) && compareAtCents > 0 ? compareAtCents / 100 : null;
  const currency = String(product.currency || "BRL").trim() || "BRL";
  const sku = String(firstAvailable?.sku || "").trim();
  const variantTitle = String(firstAvailable?.public_title || firstAvailable?.title || "").trim();
  const available = Boolean(firstAvailable?.available ?? product.available ?? true);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: title,
    brand: vendor ? { "@type": "Brand", name: vendor } : undefined,
    category: productType || undefined,
    sku: sku || undefined,
    image: images,
    description: body || undefined,
    offers: {
      "@type": "Offer",
      price: currentPrice != null ? currentPrice.toFixed(2) : undefined,
      priceCurrency: currency,
      availability: available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
  };

  const compareMarkup =
    compareAtPrice != null
      ? `<del data-total-compare-price>R$ ${compareAtPrice.toFixed(2).replace(".", ",")}</del>`
      : "";
  const currentMarkup =
    currentPrice != null
      ? `<ins data-total-price>R$ ${currentPrice.toFixed(2).replace(".", ",")}</ins>`
      : "";

  return `
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <meta property="og:title" content="${escapeHtml(title)}">
        <meta property="og:description" content="${escapeHtml(body.replace(/<[^>]+>/g, " ").trim())}">
        ${images[0] ? `<meta property="og:image" content="${escapeHtml(String(images[0]))}">` : ""}
        ${currentPrice != null ? `<meta property="og:price:amount" content="${currentPrice.toFixed(2).replace(".", ",")}">` : ""}
        <meta property="og:price:currency" content="${escapeHtml(currency)}">
        <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
        <script type="application/json" data-shopify-product>${JSON.stringify(product)}</script>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        <div>${escapeHtml(vendor)}</div>
        <div>${escapeHtml(productType)}</div>
        <div>${escapeHtml(variantTitle)}</div>
        ${compareMarkup}
        ${currentMarkup}
        ${body}
        <div>${available ? "Comprar" : "Esgotado"}</div>
      </body>
    </html>
  `;
}

async function fetchShopifyProductFallback(url: string): Promise<FetchPageResult | null> {
  if (!looksLikeShopifyProductUrl(url)) return null;
  const productJsonUrl = shopifyProductJsonUrl(url);
  if (!productJsonUrl) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(productJsonUrl, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
        accept: "application/json,text/plain,*/*",
        "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as unknown;
    const html = buildShopifyHtmlFromJson(url, payload);
    if (!html) return null;

    return {
      url,
      finalUrl: url,
      normalizedUrl: normalizeUrl(url),
      statusCode: 200,
      html,
      blocked: false,
      unavailable: false,
      redirected: false,
      source: "shopify_json",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extractJsonLdBlocks(html: string) {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const values: unknown[] = [];

  for (const block of blocks) {
    const raw = block[1]?.trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      values.push(parsed);
    } catch {
      // ignore invalid JSON-LD blocks
    }
  }

  return values;
}

function flattenJsonLdProducts(node: unknown): Record<string, unknown>[] {
  if (!node) return [];
  if (Array.isArray(node)) return node.flatMap((item) => flattenJsonLdProducts(item));
  if (typeof node !== "object") return [];

  const record = node as Record<string, unknown>;
  const type = String(record["@type"] || "").toLowerCase();
  const graph = flattenJsonLdProducts(record["@graph"]);

  const self =
    type.includes("product") || type.includes("offer") ? [record] : [];

  return [...self, ...graph];
}

function extractEmbeddedString(html: string, pattern: RegExp) {
  return html.match(pattern)?.[1]?.trim() || null;
}

function detectAvailability(text: string, html: string, jsonLdProducts: Record<string, unknown>[]) {
  const lowered = normalizeText(`${text} ${html}`);
  for (const item of jsonLdProducts) {
    const offers = item.offers as Record<string, unknown> | undefined;
    const availability = String(
      offers?.availability || item.availability || "",
    ).toLowerCase();
    if (availability.includes("instock")) return "in_stock" as const;
    if (availability.includes("outofstock") || availability.includes("soldout")) {
      return "out_of_stock" as const;
    }
    if (availability.includes("preorder")) return "preorder" as const;
  }

  if (
    lowered.includes("esgotado") ||
    lowered.includes("indisponivel") ||
    lowered.includes("sold out") ||
    lowered.includes("fora de estoque")
  ) {
    return "out_of_stock" as const;
  }
  if (lowered.includes("pre venda") || lowered.includes("preorder")) {
    return "preorder" as const;
  }
  if (lowered.includes("comprar") || lowered.includes("adicionar ao carrinho")) {
    return "in_stock" as const;
  }
  return "unknown" as const;
}

function extractConditionalOffers(html: string, visibleText: string) {
  const offers: ConditionalOffer[] = [];

  const pixMatches = [
    ...visibleText.matchAll(/R\$\s*([\d.]+,\d{2})\s+com\s+PIX(?:\s*\(-?\d+%\))?/gi),
  ];
  for (const match of pixMatches) {
    const price = decodeMoney(match[1]);
    if (price == null) continue;
    offers.push({
      type: "pix",
      price,
      label: "PIX",
      condition: match[0].replace(/\s+/g, " ").trim(),
    });
  }

  const couponMatches = [
    ...visibleText.matchAll(/(?:cupom|coupon)[\s\S]{0,80}?R\$\s*([\d.]+,\d{2})/gi),
  ];
  for (const match of couponMatches) {
    const price = decodeMoney(match[1]);
    if (price == null) continue;
    offers.push({
      type: "coupon",
      price,
      label: "Cupom",
      condition: match[0].replace(/\s+/g, " ").trim(),
    });
  }

  return offers.filter(
    (offer, index, list) =>
      list.findIndex((item) => item.type === offer.type && item.price === offer.price) === index,
  );
}

export function extractStructuredPriceData(html: string) {
  const evidence: string[] = [];
  let currentPrice: number | null = null;
  let originalPrice: number | null = null;
  let variantLabel: string | null = null;
  let currency: string | null = null;

  const compareDom = html.match(
    /<del[^>]*data-total-compare-price[^>]*>\s*R\$\s*([\d.]+,\d{2})\s*<\/del>/i,
  );
  const currentDom = html.match(
    /<ins[^>]*data-total-price[^>]*>\s*R\$\s*([\d.]+,\d{2})\s*<\/ins>/i,
  );
  if (compareDom?.[1] && currentDom?.[1]) {
    originalPrice = decodeMoney(compareDom[1]);
    currentPrice = decodeMoney(currentDom[1]);
    evidence.push("Preco original riscado na pagina");
    evidence.push("Preco atual menor destacado na pagina");
  }

  if (currentPrice == null) {
    const compareJson = html.match(/"compare_at_price"\s*:\s*(\d{3,})/i);
    const currentJson = html.match(/"price"\s*:\s*(\d{3,})/i);
    if (currentJson?.[1]) {
      currentPrice = decodeCents(currentJson[1]);
      evidence.push("Campo price encontrado em dados estruturados");
    }
    if (compareJson?.[1]) {
      originalPrice = decodeCents(compareJson[1]);
      evidence.push("Campo compareAtPrice/compare_at_price encontrado");
    }
  }

  if (currentPrice == null) {
    const ogCurrent = extractMetaContent(html, "property", "og:price:amount");
    if (ogCurrent) {
      currentPrice = decodeMoney(ogCurrent);
      evidence.push("Meta og:price:amount encontrada");
    }
  }

  if (currentPrice == null) {
    const jsonLdCurrent = extractEmbeddedString(html, /"price"\s*:\s*"(\d+\.\d{2})"/i);
    if (jsonLdCurrent) {
      currentPrice = Number(jsonLdCurrent);
      evidence.push("Campo price encontrado em JSON-LD");
    }
  }

  const textPair = html.match(/de\s*R\$\s*([\d.]+,\d{2})\s*por\s*R\$\s*([\d.]+,\d{2})/i);
  if ((!currentPrice || !originalPrice) && textPair?.[1] && textPair?.[2]) {
    originalPrice = originalPrice ?? decodeMoney(textPair[1]);
    currentPrice = currentPrice ?? decodeMoney(textPair[2]);
    evidence.push("Texto de R$ X por R$ Y encontrado");
  }

  const discountText = html.match(/(\d{1,2})%\s*OFF/gi);
  if (discountText?.length) {
    evidence.push(`Texto ${discountText[0].toUpperCase()} encontrado`);
  }

  const currencyMatch =
    extractMetaContent(html, "property", "og:price:currency") ||
    extractEmbeddedString(html, /"priceCurrency"\s*:\s*"([A-Z]{3})"/i);
  currency = currencyMatch || "BRL";

  variantLabel =
    extractEmbeddedString(html, /"title"\s*:\s*"([^"]+\s\/\s[^"]+)"/i) ||
    extractEmbeddedString(html, /"variant"\s*:\s*"([^"]+)"/i);

  return {
    currentPrice: round2(currentPrice),
    referencePrice: round2(originalPrice),
    evidence,
    currency,
    variantLabel,
  };
}

function parsePageData(page: FetchPageResult) {
  const html = page.html;
  const title =
    extractMetaContent(html, "property", "og:title") ||
    extractMetaContent(html, "name", "twitter:title") ||
    extractTitle(html);
  const description =
    extractMetaContent(html, "name", "description") ||
    extractMetaContent(html, "property", "og:description");

  const visibleText = stripHtml(html);
  const jsonLdBlocks = extractJsonLdBlocks(html);
  const products = flattenJsonLdProducts(jsonLdBlocks);

  const jsonLdName =
    products.find((item) => String(item["@type"] || "").toLowerCase().includes("product"))?.name;
  const jsonLdBrand =
    products.find((item) => String(item["@type"] || "").toLowerCase().includes("product"))?.brand;
  const jsonLdCategory =
    products.find((item) => String(item["@type"] || "").toLowerCase().includes("product"))?.category;
  const jsonLdDescription =
    products.find((item) => String(item["@type"] || "").toLowerCase().includes("product"))
      ?.description;
  const jsonLdSku =
    products.find((item) => String(item["@type"] || "").toLowerCase().includes("product"))?.sku;
  const jsonLdImages = products.flatMap((item) => {
    const image = item.image;
    if (Array.isArray(image)) return image.map(String);
    return image ? [String(image)] : [];
  });

  const embeddedBrand =
    extractEmbeddedString(html, /"vendor"\s*:\s*"([^"]+)"/i) ||
    extractEmbeddedString(html, /"brand"\s*:\s*"([^"]+)"/i);
  const embeddedCategory =
    extractEmbeddedString(html, /"type"\s*:\s*"([^"]+)"/i) ||
    extractEmbeddedString(html, /"category"\s*:\s*"([^"]+)"/i);
  const embeddedColor =
    extractEmbeddedString(html, /"color"\s*:\s*"([^"]+)"/i);
  const embeddedSize =
    extractEmbeddedString(html, /"size"\s*:\s*"([^"]+)"/i) ||
    extractEmbeddedString(html, /"option2"\s*:\s*"([^"]+)"/i);
  const embeddedSku =
    extractEmbeddedString(html, /"sku"\s*:\s*"([^"]+)"/i) ||
    extractMetaContent(html, "itemprop", "sku");

  const metaImages = uniqueStrings([
    extractMetaContent(html, "property", "og:image"),
    extractMetaContent(html, "property", "og:image:secure_url"),
  ]);

  const structuredPrice = extractStructuredPriceData(html);
  const availability = detectAvailability(visibleText, html, products);
  const conditionalOffers = extractConditionalOffers(html, visibleText);

  return {
    name: String(jsonLdName || titleCaseWords(title) || "").trim() || null,
    brand:
      typeof jsonLdBrand === "object" && jsonLdBrand && "name" in (jsonLdBrand as object)
        ? String((jsonLdBrand as { name?: unknown }).name || "")
        : String(jsonLdBrand || embeddedBrand || "").trim() || null,
    category: String(jsonLdCategory || embeddedCategory || "").trim() || null,
    color: String(embeddedColor || "").trim() || null,
    size: String(embeddedSize || "").trim() || null,
    sku: String(jsonLdSku || embeddedSku || "").trim() || null,
    description: String(jsonLdDescription || description || "").trim() || null,
    title: title || null,
    imageUrls: uniqueStrings([...metaImages, ...jsonLdImages]).map((url) => absoluteUrl(page.finalUrl, url) || url),
    currency: structuredPrice.currency || "BRL",
    availability,
    prices: {
      current: structuredPrice.currentPrice,
      original: structuredPrice.referencePrice,
      evidence: structuredPrice.evidence,
      variantLabel: structuredPrice.variantLabel,
    },
    conditionalOffers,
    visibleText,
  } satisfies PageProductData;
}

export function matchProductToPage(product: ProductWithRelations, pageData: PageProductData) {
  const scores: ProductPromoRadarResult["matchedFieldScores"] = {};
  const logs: string[] = [];
  let weightedScore = 0;
  let totalWeight = 0;

  const addScore = (
    field: keyof ProductPromoRadarResult["matchedFieldScores"],
    weight: number,
    score: number,
    note: string,
  ) => {
    if (!Number.isFinite(score)) return;
    scores[field] = round2(score) ?? 0;
    weightedScore += score * weight;
    totalWeight += weight;
    logs.push(`${field}: ${note} (${Math.round(score * 100)}%)`);
  };

  const nameScore = Math.max(
    similarityByTokens(product.name, pageData.name),
    similarityByTokens(product.name, pageData.title),
    includesLoose(pageData.visibleText, product.name) ? 0.92 : 0,
  );
  addScore("name", 0.38, nameScore, `comparando "${product.name}" com nome/titulo da pagina`);

  if (product.brand?.name || product.brand?.slug || product.brandId) {
    const brandScore = Math.max(
      similarityByTokens(product.brand.name, pageData.brand),
      includesLoose(pageData.visibleText, product.brand.name) ? 0.85 : 0,
      similarityByTokens(product.store, pageData.brand),
    );
    addScore("brand", 0.15, brandScore, `marca "${product.brand.name}" contra dados da pagina`);
  }

  if (product.category) {
    const categoryScore = Math.max(
      similarityByTokens(product.category, pageData.category),
      includesLoose(pageData.visibleText, product.category) ? 0.75 : 0,
    );
    addScore("category", 0.08, categoryScore, `categoria "${product.category}"`);
  }

  if (product.color) {
    const colorScore = Math.max(
      similarityByTokens(product.color, pageData.color),
      includesLoose(pageData.visibleText, product.color) ? 0.8 : 0,
    );
    addScore("color", 0.09, colorScore, `cor "${product.color}"`);
  }

  if (product.size) {
    const sizeScore = Math.max(
      similarityByTokens(product.size, pageData.size),
      includesLoose(pageData.visibleText, product.size) ? 0.8 : 0,
    );
    addScore("size", 0.08, sizeScore, `tamanho "${product.size}"`);
  }

  const pageSku = pageData.sku;
  if (pageSku) {
    const skuScore =
      normalizeText(pageSku) && normalizeText(product.notes).includes(normalizeText(pageSku))
        ? 1
        : similarityByTokens(product.name, pageSku);
    addScore("sku", 0.12, skuScore, `sku/identificador "${pageSku}"`);
  }

  const productMainImage = normalizeText(productImage(product));
  if (productMainImage && pageData.imageUrls.length) {
    const imageScore = pageData.imageUrls.some((url) => normalizeText(url).includes(productMainImage))
      ? 1
      : pageData.imageUrls.some((url) => productMainImage.includes(normalizeText(url)))
        ? 1
        : 0;
    addScore("image", 0.1, imageScore, "comparacao de imagem principal");
  }

  const confidence =
    totalWeight > 0
      ? clamp(weightedScore / totalWeight)
      : 0;

  const productMatched =
    confidence >= PROMO_MATCH_CONFIDENCE_THRESHOLD &&
    (nameScore >= 0.45 || includesLoose(pageData.visibleText, product.name));

  if (!productMatched) {
    logs.push("produto nao confirmado: confianca abaixo do limite");
  } else {
    logs.push("produto confirmado pela combinacao de nome + atributos complementares");
  }

  return {
    productMatched,
    matchConfidence: round2(confidence) ?? 0,
    logs,
    scores,
  };
}

function computeStatusFromPage(page: FetchPageResult, pageData: PageProductData) {
  if (page.blocked) return "access_blocked" as const;
  if (page.unavailable) return "page_unavailable" as const;
  if (pageData.availability === "out_of_stock") return "out_of_stock" as const;
  return "ok" as const;
}

export function analyzeProductWithPage(
  product: ProductWithRelations,
  page: FetchPageResult,
): ProductPromoRadarResult {
  const checkedAt = nowIso();
  const logs: string[] = [];

  if (!product.purchaseUrl) {
    return {
      productId: product.id,
      productName: product.name,
      productBrand: product.brand.name,
      imageUrl: productImage(product),
      purchaseUrl: null,
      normalizedPurchaseUrl: null,
      finalUrl: null,
      productMatched: false,
      matchConfidence: 0,
      isOnSale: false,
      autoDisplayEligible: false,
      originalPrice: null,
      salePrice: null,
      discountPercentage: null,
      pixPrice: null,
      currency: "BRL",
      availability: "unknown",
      variationAnalyzed: null,
      evidence: [],
      status: "analysis_failed",
      reason: "Produto sem purchaseUrl salva",
      checkedAt,
      logs: ["produto ignorado porque nao possui URL de compra"],
      conditionalOffers: [],
      pageTitle: null,
      matchedFieldScores: {},
    };
  }

  logs.push(`URL salva: ${product.purchaseUrl}`);
  logs.push(`URL normalizada: ${page.normalizedUrl}`);
  if (page.redirected) logs.push(`pagina redirecionou para ${page.finalUrl}`);

  if (page.blocked || page.unavailable) {
    const status = page.blocked ? "access_blocked" : "page_unavailable";
    return {
      productId: product.id,
      productName: product.name,
      productBrand: product.brand.name,
      imageUrl: productImage(product),
      purchaseUrl: product.purchaseUrl,
      normalizedPurchaseUrl: page.normalizedUrl,
      finalUrl: page.finalUrl,
      productMatched: false,
      matchConfidence: 0,
      isOnSale: false,
      autoDisplayEligible: false,
      originalPrice: null,
      salePrice: null,
      discountPercentage: null,
      pixPrice: null,
      currency: "BRL",
      availability: "unknown",
      variationAnalyzed: null,
      evidence: [],
      status,
      reason:
        status === "access_blocked"
          ? "A pagina bloqueou a leitura automatica"
          : "A pagina nao esta disponivel",
      checkedAt,
      logs,
      conditionalOffers: [],
      pageTitle: null,
      matchedFieldScores: {},
    };
  }

  const pageData = parsePageData(page);
  logs.push(`titulo da pagina: ${pageData.title || "sem titulo"}`);
  logs.push(`nome identificado: ${pageData.name || "nao identificado"}`);
  logs.push(`marca identificada: ${pageData.brand || "nao identificada"}`);

  const match = matchProductToPage(product, pageData);
  logs.push(...match.logs);

  const statusFromPage = computeStatusFromPage(page, pageData);
  if (!match.productMatched) {
    return {
      productId: product.id,
      productName: product.name,
      productBrand: product.brand.name,
      imageUrl: productImage(product),
      purchaseUrl: product.purchaseUrl,
      normalizedPurchaseUrl: page.normalizedUrl,
      finalUrl: page.finalUrl,
      productMatched: false,
      matchConfidence: match.matchConfidence,
      isOnSale: false,
      autoDisplayEligible: false,
      originalPrice: null,
      salePrice: null,
      discountPercentage: null,
      pixPrice: null,
      currency: pageData.currency || "BRL",
      availability: pageData.availability,
      variationAnalyzed: pageData.prices.variantLabel,
      evidence: [],
      status: "product_mismatch",
      reason: "A pagina acessada parece corresponder a outro produto",
      checkedAt,
      logs,
      conditionalOffers: pageData.conditionalOffers,
      pageTitle: pageData.title,
      matchedFieldScores: match.scores,
    };
  }

  const originalPrice = round2(pageData.prices.original);
  const salePrice = round2(pageData.prices.current);
  const discountPercentage = percentOff(originalPrice, salePrice);
  const pixPrice =
    pageData.conditionalOffers.find((offer) => offer.type === "pix")?.price ?? null;

  const evidence = [...pageData.prices.evidence];
  if (originalPrice != null && salePrice != null && salePrice < originalPrice) {
    evidence.push("Preco atual menor que o preco original");
  }
  if (discountPercentage != null) {
    evidence.push(`Desconto principal de ${discountPercentage}% confirmado`);
  }

  let status: PromoRadarStatus = statusFromPage;
  let reason: string | null = null;

  if (status === "out_of_stock") {
    reason = "Produto identificado como indisponivel na pagina";
  } else if (salePrice == null && originalPrice == null) {
    status = "price_not_found";
    reason = "Nao foi possivel identificar preco principal na pagina";
  }

  const isOnSale =
    match.productMatched &&
    originalPrice != null &&
    salePrice != null &&
    salePrice < originalPrice &&
    evidence.length > 0;

  const autoDisplayEligible =
    isOnSale && match.matchConfidence >= PROMO_MATCH_CONFIDENCE_THRESHOLD;

  if (!reason && !isOnSale && status === "ok") {
    reason = "Promocao nao confirmada com evidencia concreta";
  }

  logs.push(`preco original: ${originalPrice ?? "nao encontrado"}`);
  logs.push(`preco atual: ${salePrice ?? "nao encontrado"}`);
  logs.push(`pix: ${pixPrice ?? "nao encontrado"}`);
  logs.push(`status final: ${status}`);

  return {
    productId: product.id,
    productName: product.name,
    productBrand: product.brand.name,
    imageUrl: productImage(product),
    purchaseUrl: product.purchaseUrl,
    normalizedPurchaseUrl: page.normalizedUrl,
    finalUrl: page.finalUrl,
    productMatched: match.productMatched,
    matchConfidence: match.matchConfidence,
    isOnSale,
    autoDisplayEligible,
    originalPrice,
    salePrice,
    discountPercentage,
    pixPrice: round2(pixPrice),
    currency: pageData.currency || "BRL",
    availability: pageData.availability,
    variationAnalyzed: pageData.prices.variantLabel,
    evidence,
    status,
    reason,
    checkedAt,
    logs,
    conditionalOffers: pageData.conditionalOffers,
    pageTitle: pageData.title,
    matchedFieldScores: match.scores,
  };
}

async function fetchPage(url: string): Promise<FetchPageResult> {
  const normalizedUrl = normalizeUrl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(normalizedUrl, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    const html = await response.text();
    const statusCode = response.status;
    const blocked = [401, 403, 429].includes(statusCode);
    const unavailable = statusCode >= 500 || statusCode === 404;

    if ((blocked || unavailable) && looksLikeShopifyProductUrl(normalizedUrl)) {
      const fallback = await fetchShopifyProductFallback(normalizedUrl);
      if (fallback) return fallback;
    }

    return {
      url,
      finalUrl: response.url || normalizedUrl,
      normalizedUrl,
      statusCode,
      html,
      blocked,
      unavailable,
      redirected: normalizeUrl(response.url || normalizedUrl) !== normalizedUrl,
      source: "html",
    };
  } catch {
    const fallback = await fetchShopifyProductFallback(normalizedUrl);
    if (fallback) return fallback;

    return {
      url,
      finalUrl: normalizedUrl,
      normalizedUrl,
      statusCode: 0,
      html: "",
      blocked: false,
      unavailable: true,
      redirected: false,
      source: "html",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function extractCampaignUrlsFromSitemap(domain: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`https://${domain}/sitemap.xml`, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
      },
      signal: controller.signal,
    });
    const xml = await response.text();
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
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function buildBrandSummaries(
  products: ProductWithRelations[],
  results: ProductPromoRadarResult[],
  domainCampaigns: Map<string, string[]>,
) {
  const saleResults = results.filter((result) => result.autoDisplayEligible);
  const grouped = new Map<string, PromoRadarBrandSummary>();

  for (const result of saleResults) {
    const product = products.find((item) => item.id === result.productId);
    if (!product) continue;

    const storeDomain = domainFrom(result.finalUrl || result.purchaseUrl || "");
    const current = grouped.get(product.brandId);
    if (current) {
      current.matchedProducts.push(result);
      continue;
    }

    grouped.set(product.brandId, {
      brandId: product.brandId,
      brand: product.brand.name,
      storeDomain,
      headline: "",
      detectedAt: nowIso(),
      campaignUrls: domainCampaigns.get(storeDomain) || [],
      matchedProducts: [result],
    });
  }

  return [...grouped.values()]
    .map((brand) => {
      const count = brand.matchedProducts.length;
      const label = count === 1 ? "peca" : "pecas";
      brand.headline =
        count >= 1
          ? `${brand.brand} tem ${count} ${label} com promocao confirmada agora.`
          : `${brand.brand} sem promocao confirmada.`;
      brand.matchedProducts = brand.matchedProducts.slice(0, 6);
      return brand;
    })
    .sort((a, b) => b.matchedProducts.length - a.matchedProducts.length);
}

function timeoutResult(
  product: ProductWithRelations,
  reason = "Tempo limite da varredura atingido antes de concluir a analise",
) {
  return {
    productId: product.id,
    productName: product.name,
    productBrand: product.brand.name,
    imageUrl: productImage(product),
    purchaseUrl: product.purchaseUrl,
    normalizedPurchaseUrl: product.purchaseUrl ? normalizeUrl(product.purchaseUrl) : null,
    finalUrl: null,
    productMatched: false,
    matchConfidence: 0,
    isOnSale: false,
    autoDisplayEligible: false,
    originalPrice: null,
    salePrice: null,
    discountPercentage: null,
    pixPrice: null,
    currency: "BRL",
    availability: "unknown" as const,
    variationAnalyzed: null,
    evidence: [],
    status: "analysis_failed" as const,
    reason,
    checkedAt: nowIso(),
    logs: ["analise interrompida por timeout global do radar"],
    conditionalOffers: [],
    pageTitle: null,
    matchedFieldScores: {},
  } satisfies ProductPromoRadarResult;
}

function timeoutResponse(fallback?: PromoRadarResponse): PromoRadarResponse {
  if (fallback) {
    return {
      ...fallback,
      generatedAt: nowIso(),
    };
  }

  return {
    generatedAt: nowIso(),
    products: [],
    brands: [],
    externalPromotions: [],
  };
}

function moneyFromBrazilian(value: string) {
  return Number(value.replace(/\./g, "").replace(",", "."));
}

async function discoverUseElizahPromotions(): Promise<ExternalPromotion[]> {
  try {
    const page = await fetchPage("https://www.useelizah.com.br/");
    if (page.unavailable || page.blocked) return [];

    const cards = [...page.html.matchAll(
      /<div class="prod\b[\s\S]*?<a href="([^"?#]+)\/[^"]*"[\s\S]*?<h3[^>]*>([^<]+)<\/h3>[\s\S]*?<p class="valor_de">[\s\S]*?R\$\s*([\d.,]+)[\s\S]*?<p class="valor(?:_final)?"><span>R\$\s*([\d.,]+)/gi,
    )];

    return cards
      .map<ExternalPromotion | null>((match) => {
        const originalPrice = moneyFromBrazilian(match[3]);
        const salePrice = moneyFromBrazilian(match[4]);
        if (!Number.isFinite(originalPrice) || !Number.isFinite(salePrice) || salePrice >= originalPrice) return null;
        const name = match[2].replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
        const purchaseUrl = new URL(`${match[1]}/`, "https://www.useelizah.com.br/").toString();
        const color = name.match(/-\s*([^–-]+)$/)?.[1]?.trim() || null;
        return {
          id: `use-elizah-${match[1]}`,
          brand: "Elizah",
          name,
          category: /^body/i.test(name) ? "Bodies" : /^blusa|^t-shirt|^regata/i.test(name) ? "Blusas" : "Outros",
          color,
          purchaseUrl,
          originalPrice,
          salePrice,
          discountPercentage: Math.round(((originalPrice - salePrice) / originalPrice) * 100),
          imageUrl: null,
          detectedAt: nowIso(),
        } satisfies ExternalPromotion;
      })
      .filter((item): item is ExternalPromotion => Boolean(item))
      .sort((a, b) => b.discountPercentage - a.discountPercentage)
      .slice(0, 12);
  } catch {
    return [];
  }
}

function failureResult(product: ProductWithRelations, error: unknown) {
  return {
    productId: product.id,
    productName: product.name,
    productBrand: product.brand.name,
    imageUrl: productImage(product),
    purchaseUrl: product.purchaseUrl,
    normalizedPurchaseUrl: product.purchaseUrl ? normalizeUrl(product.purchaseUrl) : null,
    finalUrl: null,
    productMatched: false,
    matchConfidence: 0,
    isOnSale: false,
    autoDisplayEligible: false,
    originalPrice: null,
    salePrice: null,
    discountPercentage: null,
    pixPrice: null,
    currency: "BRL",
    availability: "unknown" as const,
    variationAnalyzed: null,
    evidence: [],
    status: "analysis_failed" as const,
    reason: error instanceof Error ? error.message : "Falha inesperada na analise",
    checkedAt: nowIso(),
    logs: ["falha inesperada ao analisar produto"],
    conditionalOffers: [],
    pageTitle: null,
    matchedFieldScores: {},
  } satisfies ProductPromoRadarResult;
}

async function runPromoRadar(userId: string): Promise<PromoRadarResponse> {
  const startedAt = Date.now();
  const deadline = deadlineFromNow(PROMO_RADAR_TIMEOUT_MS);

  const products = (await productRepository.findAllByUser(userId))
    .filter((product) => product.status !== "Desisti da compra")
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, MAX_PRODUCTS_TO_SCAN);

  const [results, externalPromotions] = await Promise.all([
    mapWithConcurrency(
    products,
    PRODUCT_SCAN_CONCURRENCY,
    async (product) => {
      if (isDeadlineExceeded(deadline)) {
        return timeoutResult(product);
      }

      try {
        if (!product.purchaseUrl) {
          return analyzeProductWithPage(product, {
            url: "",
            finalUrl: "",
            normalizedUrl: "",
            statusCode: 0,
            html: "",
            blocked: false,
            unavailable: false,
            redirected: false,
          });
        }

        const page = await fetchPage(product.purchaseUrl);
        if (isDeadlineExceeded(deadline)) {
          return timeoutResult(product);
        }
        return analyzeProductWithPage(product, page);
      } catch (error) {
        return failureResult(product, error);
      }
    },
    ),
    discoverUseElizahPromotions(),
  ]);

  const domains = uniqueStrings(
    products
      .map((product) => product.purchaseUrl)
      .filter(Boolean)
      .map((url) => domainFrom(String(url))),
  );

  const domainEntries = await mapWithConcurrency(
    domains,
    DOMAIN_SCAN_CONCURRENCY,
    async (domain) => {
      if (isDeadlineExceeded(deadline)) return [domain, [] as string[]] as const;
      return [domain, await extractCampaignUrlsFromSitemap(domain)] as const;
    },
  );

  const domainCampaigns = new Map<string, string[]>(domainEntries);
  const data = {
    generatedAt: nowIso(),
    products: results,
    brands: buildBrandSummaries(products, results, domainCampaigns),
    externalPromotions,
  } satisfies PromoRadarResponse;

  cache.set(userId, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    data,
  });

  return {
    ...data,
    generatedAt: new Date(Math.max(startedAt, Date.now())).toISOString(),
  };
}

export const promoRadarService = {
  async externalPromotionMedia(rawUrl: string) {
    const url = new URL(rawUrl);
    if (!/(^|\.)useelizah\.com\.br$/i.test(url.hostname)) return [];
    const page = await fetchPage(url.toString());
    if (page.unavailable || page.blocked) return [];
    const ogImage = page.html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1];
    const imageUrls = uniqueStrings(
      [absoluteUrl(page.finalUrl, ogImage), ...[...page.html.matchAll(/<(?:img)[^>]+(?:src|data-src)=["']([^"']+)["']/gi)]
        .map((match) => absoluteUrl(page.finalUrl, match[1]))]
        .filter((item) => item?.includes("/produtos/")),
    ).slice(0, 12);
    const videoUrls = uniqueStrings(
      [...page.html.matchAll(/<(?:video|source)[^>]+src=["']([^"']+)["']/gi)]
        .map((match) => absoluteUrl(page.finalUrl, match[1])),
    ).slice(0, 4);
    return [...imageUrls.map((url) => ({ type: "image" as const, url })), ...videoUrls.map((url) => ({ type: "video" as const, url }))];
  },
  async weeklyBrandPromotions(userId: string): Promise<PromoRadarResponse> {
    const cached = cache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.data;
    const pending = inFlight.get(userId);
    if (pending) return pending;

    const staleData = cached?.data;
    const execution = Promise.race<PromoRadarResponse>([
      runPromoRadar(userId),
      new Promise<PromoRadarResponse>((resolve) => {
        setTimeout(() => resolve(timeoutResponse(staleData)), PROMO_RADAR_TIMEOUT_MS + 3000);
      }),
    ]).finally(() => {
      inFlight.delete(userId);
    });
    inFlight.set(userId, execution);
    return execution;
  },
};
