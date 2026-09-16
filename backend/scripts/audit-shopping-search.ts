/** Run from backend: npx tsx scripts/audit-shopping-search.ts */
import { env } from "../src/config/env.js";
import { SerpApiProductSearchProvider } from "../src/services/serpApiProductSearchProvider.js";
import type { ShopperQuery, SearchedProduct } from "../src/services/productSearchProvider.js";

const queries = [
  "kit shampoo Wella",
  "kit Wella",
  "kit Wella Professionals",
  "shampoo e condicionador Wella",
  "kit shampoo condicionador Wella",
];

type RawItem = Record<string, unknown>;
const asItems = (value: unknown): RawItem[] => Array.isArray(value) ? value.filter((item): item is RawItem => !!item && typeof item === "object") : [];
const asText = (value: unknown) => typeof value === "string" ? value : "";
const asNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
const validUrl = (value: unknown) => { try { const url = new URL(asText(value)); return /^https?:$/.test(url.protocol) ? url.toString() : null; } catch { return null; } };
const queryObject = (value: string): ShopperQuery => ({ query: value, category: null, maxPrice: null, maxPriceIsHard: false, currency: "BRL", colors: [], size: null, brands: [], usage: null, style: [], exclude: [], originalOnly: false, sortPreference: "best_match" });
const canonical = (value: string) => { try { const url = new URL(value); url.hash = ""; [...url.searchParams.keys()].filter((key) => /^(utm_|gclid|fbclid)/i.test(key)).forEach((key) => url.searchParams.delete(key)); return url.toString(); } catch { return value; } };

if (!env.serpApi.apiKey) {
  console.error("SERPAPI_API_KEY ausente. Configure backend/.env ou a variável de ambiente.");
  process.exit(2);
}

const provider = new SerpApiProductSearchProvider();
const captured: Array<{ query: string; raw: RawItem[]; processed: SearchedProduct[] }> = [];

for (const phrase of queries) {
  const params = new URLSearchParams({ engine: "google_shopping", q: phrase, gl: "br", hl: "pt-br", num: "20", api_key: env.serpApi.apiKey });
  const response = await fetch(`https://serpapi.com/search.json?${params}`, { signal: AbortSignal.timeout(35_000) });
  if (!response.ok) throw new Error(`SerpApi ${response.status} em ${phrase}`);
  const body = await response.json() as Record<string, unknown>;
  if (body.error) throw new Error(`SerpApi em ${phrase}: ${String(body.error)}`);
  const raw = asItems(body.shopping_results);
  // Feed the exact captured response into the production provider, without a second paid request.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  let processed: SearchedProduct[];
  try { processed = await provider.search(queryObject(phrase)); }
  finally { globalThis.fetch = originalFetch; }
  captured.push({ query: phrase, raw, processed });
}

const allRaw = captured.flatMap((entry) => entry.raw.map((item) => ({ query: entry.query, item })));
const withMultipleSources = allRaw.filter(({ item }) => item.multiple_sources === true || (Array.isArray(item.multiple_sources) && item.multiple_sources.length > 0));
const productItems = [...new Map(withMultipleSources.filter(({ item }) => asText(item.immersive_product_page_token)).map(({ item }) => [asText(item.product_id), item])).values()].slice(0, 8);
const productDetails: Array<{ productId: string; sellers: unknown; error?: string }> = [];
for (const item of productItems) {
  const productId = asText(item.product_id);
  const params = new URLSearchParams({ engine: "google_immersive_product", page_token: asText(item.immersive_product_page_token), more_stores: "true", api_key: env.serpApi.apiKey });
  try {
    const response = await fetch(`https://serpapi.com/search.json?${params}`, { signal: AbortSignal.timeout(35_000) });
    const body = await response.json() as Record<string, unknown>;
    const details = body.product_results as Record<string, unknown> | undefined;
    productDetails.push({ productId, sellers: details?.stores ?? [], error: body.error ? String(body.error) : !response.ok ? `HTTP ${response.status}` : undefined });
  } catch (error) { productDetails.push({ productId, sellers: [], error: error instanceof Error ? error.message : String(error) }); }
}

const keyCounts = new Map<string, number>();
for (const { item } of allRaw) {
  const key = asText(item.product_id) || canonical(asText(item.link) || asText(item.product_link));
  if (key) keyCounts.set(key, (keyCounts.get(key) || 0) + 1);
}
const report = {
  generatedAt: new Date().toISOString(),
  note: "Google Shopping visual não foi consultado; SerpApi foi consultada diretamente. A seleção exibida é a mesma fatia de 12 do Personal Shopper para estas consultas sem orçamento.",
  queries: captured.map(({ query, raw, processed }) => ({
    query, rawCount: raw.length, providerCount: processed.length, displayedCount: processed.slice(0, 12).length,
    dropped: raw.filter((item) => !processed.some((p) => p.productUrl === (validUrl(item.link) || validUrl(item.product_link)))).map((item) => ({ title: item.title, productId: item.product_id, link: item.link, productLink: item.product_link, multipleSources: item.multiple_sources })),
    hiddenByTwelve: processed.slice(12).map((item) => ({ title: item.title, store: item.store, price: item.price, url: item.productUrl })),
    results: processed.map((item) => ({ title: item.title, store: item.store, price: item.price, previousPrice: item.previousPrice, url: item.productUrl, score: item.match.total })),
  })),
  duplicateProductIdsOrUrlsAcrossQueries: [...keyCounts].filter(([, count]) => count > 1).map(([key, count]) => ({ key, count })),
  multipleSources: withMultipleSources.map(({ query, item }) => ({ query, title: item.title, productId: item.product_id, multipleSources: item.multiple_sources, source: item.source, link: item.link })),
  productDetails: productDetails.map(({ productId, sellers, error }) => ({ productId, error, sellers: asItems(sellers).map((seller) => ({ name: seller.name, title: seller.title, price: asNumber(seller.extracted_price) ?? seller.price, originalPrice: asNumber(seller.extracted_original_price) ?? seller.original_price, link: seller.link })) })),
};
console.log(JSON.stringify(report, null, 2));
