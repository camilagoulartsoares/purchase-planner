import { env } from "../config/env.js";
import { createHash } from "node:crypto";
import { AppError } from "../middlewares/errorHandler.js";
import { preserveBetterOfferReview, type ProductSearchProvider, type SearchedProduct, type ShopperQuery } from "./productSearchProvider.js";
import { normalizeShopperMerchant } from "./shopperMerchantService.js";
import { availabilityFromSource } from "./shopperAvailabilityService.js";
import { normalizeShopperText, shopperTokens, tokenMatches } from "./shopperIntentService.js";

type SerpResult = {
  position?: number; product_id?: string; title?: string; link?: string; product_link?: string; source?: string;
  price?: string; installment?: { extracted_price?: number; period?: number }; snippet?: string; second_hand_condition?: string;
  extracted_price?: number; extracted_old_price?: number; thumbnail?: string; rating?: number; reviews?: number;
  delivery?: string; availability?: string; in_stock?: boolean; out_of_stock?: boolean; stock?: string | number; extensions?: string[];
  multiple_sources?: boolean; immersive_product_page_token?: string;
  images?: Array<{ thumbnail?: string; link?: string; image?: string }>;
};

function shoppingPrice(item: SerpResult) {
  const listed = item.extracted_price;
  if (typeof listed !== "number" || !Number.isFinite(listed) || listed <= 0) return null;
  if (/\/(?:mo|month|mes|mês)\b/i.test(item.price || "")) return null;
  if (item.installment?.extracted_price === listed && item.installment.period && item.installment.period > 1) return null;
  return listed;
}

function validRating(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 5 ? value : null;
}

function validReviewCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function shoppingOfferIdentity(url: string, item: SerpResult) {
  return `${url}|${normalizeShopperText(item.source || "")}|${shoppingPrice(item) ?? ""}`;
}

export type ProductDetailCandidate = { productId: string; token: string; title: string; relevance: number; sourceQuery: string; sourcePosition: number; imageUrls: string[] };

function validUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try { const url = new URL(value); return /^https?:$/.test(url.protocol) ? url.toString() : null; } catch { return null; }
}

function imageUrls(...values: unknown[]) {
  const urls: string[] = [];
  const visit = (value: unknown) => {
    if (typeof value === "string") { const url = validUrl(value); if (url) urls.push(url); return; }
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") Object.entries(value as Record<string, unknown>).forEach(([key, child]) => { if (/image|thumbnail|photo/i.test(key)) visit(child); });
  };
  values.forEach(visit);
  return [...new Set(urls)];
}

function words(value: string) {
  return normalizeShopperText(value).split(/[^a-z0-9]+/).filter((word) => word.length > 2 || /\d/.test(word));
}

function parseMoney(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value !== "string") return null;
  const match = /(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d+[.,]\d{2}|\d+)/i.exec(value.trim());
  if (!match) return null;
  const raw = match[1];
  const amount = raw.includes(",") ? Number(raw.replace(/\./g, "").replace(",", ".")) : /^\d{1,3}(?:\.\d{3})+$/.test(raw) ? Number(raw.replace(/\./g, "")) : Number(raw);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function isBrlCurrency(value: unknown) {
  if (value == null || value === "") return true;
  return /^(r\$?|brl|br)$/i.test(String(value).trim());
}

type OrganicPriceSource = {
  snippet?: string;
  extensions?: string[];
  rich_snippet?: {
    top?: { detected_extensions?: { price?: unknown; currency?: unknown }; extensions?: string[] };
    bottom?: { detected_extensions?: { price?: unknown; currency?: unknown }; extensions?: string[] };
  };
};

export function parseOrganicPrice(item: OrganicPriceSource) {
  const snippets = [item.rich_snippet?.top, item.rich_snippet?.bottom];
  for (const snippet of snippets) {
    const detected = snippet?.detected_extensions;
    const displayed = snippet?.extensions?.map((text) => /(?:r\$|brl)\s*(\d[\d.,]*)/i.exec(text))
      .find((match) => match)?.[1];
    const shownPrice = displayed ? parseMoney(displayed) : null;
    const structuredPrice = parseMoney(detected?.price);
    if (shownPrice) return shownPrice;
    if (structuredPrice && detected?.currency && isBrlCurrency(detected.currency)) return structuredPrice;
  }
  // General snippets can quote a price for another item, installment or listing.
  return null;
}

function parseInstallment(text: string) {
  const match = /(\d+)\s*x\s*(?:de\s*)?(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[.,]\d{2}|\d+)/i.exec(text);
  if (!match) return null;
  const amount = parseMoney(match[2]);
  const count = Number(match[1]);
  if (!amount || !Number.isFinite(count) || count < 2) return null;
  return { count, amount };
}

type StorePriceSource = {
  extracted_price?: number;
  extracted_total?: number;
  shipping_extracted?: number;
  installments_description?: string;
  details_and_offers?: string[];
};

export function resolveStorePrice(store: StorePriceSource) {
  const listed = typeof store.extracted_price === "number" && store.extracted_price >= 0 ? store.extracted_price : null;
  const total = typeof store.extracted_total === "number" && store.extracted_total > 0 ? store.extracted_total : null;
  const shipping = typeof store.shipping_extracted === "number" && store.shipping_extracted >= 0 ? store.shipping_extracted : null;
  if (listed != null && total != null && shipping != null && Math.abs(total - (listed + shipping)) <= 0.05) return listed;
  const installment = parseInstallment([store.installments_description, ...(store.details_and_offers || [])].filter(Boolean).join(" "));
  if (installment && listed != null && Math.abs(listed - installment.amount) <= 0.05) {
    if (total != null && total > listed) return total;
    return Math.round(installment.amount * installment.count * 100) / 100;
  }
  if ((store.installments_description || installment) && total != null && (listed == null || total > listed)) return total;
  return listed ?? total;
}

function score(result: Omit<SearchedProduct, "match" | "reason">, query: ShopperQuery) {
  const title = words([result.title, result.productTitle, result.attributesText].filter(Boolean).join(" "));
  const requested = [...new Set(words([query.query, ...query.colors, ...query.style, ...query.brands].join(" ")))];
  const queryScore = requested.length ? Math.round((requested.filter((word) => title.includes(word)).length / requested.length) * 100) : 50;
  const budgetScore = query.maxPrice == null || result.price == null ? 50 : result.price <= query.maxPrice ? 100 : Math.max(0, 100 - ((result.price - query.maxPrice) / query.maxPrice) * 100);
  const styleScore = query.style.length + query.colors.length ? Math.min(100, queryScore + 10) : 50;
  const completeness = [result.imageUrl, result.store, result.price, result.productUrl, result.rating].filter((item) => item != null).length * 20;
  return { query: queryScore, budget: Math.round(budgetScore), style: styleScore, completeness, total: Math.round(queryScore * .7 + budgetScore * .15 + styleScore * .05 + completeness * .1) };
}

export class SerpApiProductSearchProvider implements ProductSearchProvider {
  readonly id = "serpapi-google-shopping-v2";
  googleDiagnostics: { status: string; pricedOffers: number; organicResults: number; immersiveProducts?: number; parsedOffers: number; durationMs?: number; error?: string } = { status: "not_requested", pricedOffers: 0, organicResults: 0, parsedOffers: 0 };
  googleDetailCandidates: ProductDetailCandidate[] = [];
  readonly nextStorePageTokens = new Map<string, string>();
  shoppingDiagnostics: Array<{ phrase: string; engine: string; status: string; rawCount: number; parsedCount: number; durationMs?: number; error?: string }> = [];
  parseDiagnostics: Array<{ phrase: string; provider: string; raw: number; parsed: number; missingCommercialUrlOrTitle: number; duplicateOffer: number }> = [];
  available() { return Boolean(env.serpApi.apiKey); }

  async search(query: ShopperQuery) { return (await this.searchDetailed(query, query.query)).results; }

  private parseShoppingItems(raw: SerpResult[], query: ShopperQuery, phrase: string, provider: string) {
    const seen = new Map<string, SearchedProduct>();
    let missingCommercialUrlOrTitle = 0;
    let duplicateOffer = 0;
    const detailCandidates: ProductDetailCandidate[] = [];
    const checkedAt = new Date().toISOString();
    const results = raw.flatMap((item, index) => {
      const productUrl = validUrl(item.link) || validUrl(item.product_link);
      if (!productUrl || !item.title) { missingCommercialUrlOrTitle++; return []; }
      const identity = shoppingOfferIdentity(productUrl, item);
      const price = shoppingPrice(item);
      const previousPrice = typeof item.extracted_old_price === "number" && item.extracted_old_price >= 0 ? item.extracted_old_price : null;
      const images = imageUrls(item.thumbnail, item.images);
      const base = { id: `search-${createHash("sha256").update(identity).digest("hex").slice(0, 24)}`, provider, title: item.title, price, previousPrice, currency: "BRL" as const, store: item.source || null, merchant: normalizeShopperMerchant(item.source), brand: null, imageUrl: images[0] || null, imageUrls: images, imageSource: images.length ? "thumbnail" as const : null, productUrl, rating: validRating(item.rating), reviewCount: validReviewCount(item.reviews), shipping: item.delivery || null, availability: [availabilityFromSource(item) || item.availability, item.second_hand_condition].filter(Boolean).join("; ") || null, discountPercent: price != null && previousPrice != null && previousPrice > price ? Math.round(((previousPrice - price) / previousPrice) * 100) : null, productId: item.product_id || null, checkedAt, sourceQuery: phrase, sourcePosition: item.position ?? index + 1, productTitle: item.title, attributesText: item.snippet || null };
      const match = score(base, query);
      if (item.product_id && item.immersive_product_page_token) detailCandidates.push({ productId: item.product_id, token: item.immersive_product_page_token, title: item.title, relevance: match.total, sourceQuery: phrase, sourcePosition: item.position ?? index + 1, imageUrls: images });
      const result = { ...base, match, reason: "Oferta encontrada na busca de produtos." };
      const existing = seen.get(identity);
      if (existing) { duplicateOffer++; preserveBetterOfferReview(existing, result); if (availabilityFromSource({ availability: result.availability }) === "out_of_stock") existing.availability = "out_of_stock"; return []; }
      seen.set(identity, result);
      return [result];
    }).sort((a, b) => b.match.total - a.match.total || (a.price ?? Infinity) - (b.price ?? Infinity));
    this.parseDiagnostics.push({ phrase, provider, raw: raw.length, parsed: results.length, missingCommercialUrlOrTitle, duplicateOffer });
    return { results, detailCandidates };
  }

  async searchGoogleResults(query: ShopperQuery): Promise<SearchedProduct[]> {
    const startedAt = Date.now();
    this.googleDetailCandidates = [];
    if (!this.available()) return [];
    const params = new URLSearchParams({ engine: "google", q: query.query, gl: "br", hl: "pt-br", api_key: env.serpApi.apiKey });
    let response: Response;
    try { response = await fetch(`https://serpapi.com/search.json?${params}`, { signal: AbortSignal.timeout(35_000) }); }
    catch (error) { this.googleDiagnostics = { status: "request_failed", pricedOffers: 0, organicResults: 0, parsedOffers: 0, durationMs: Date.now() - startedAt, error: error instanceof Error ? error.name : "unknown" }; return []; }
    if (!response.ok) { this.googleDiagnostics = { status: "http_error", pricedOffers: 0, organicResults: 0, parsedOffers: 0, durationMs: Date.now() - startedAt, error: String(response.status) }; return []; }
    const body = await response.json() as { shopping_results?: SerpResult[]; product_result?: { title?: string; rating?: number; reviews?: number; pricing?: Array<{ name?: string; description?: string; link?: string; extracted_price?: number; thumbnail?: string; availability?: string; in_stock?: boolean; out_of_stock?: boolean; stock?: string | number; buying_options?: string[] }> }; immersive_products?: Array<{ title?: string; thumbnail?: string; immersive_product_page_token?: string; extracted_price?: number; source?: string }>; organic_results?: Array<{ title?: string; link?: string; source?: string; snippet?: string; thumbnail?: string; position?: number; availability?: string; in_stock?: boolean; out_of_stock?: boolean; stock?: string | number; extensions?: string[]; rich_snippet?: { top?: { detected_extensions?: { price?: unknown; currency?: unknown; availability?: string }; extensions?: string[] }; bottom?: { detected_extensions?: { price?: unknown; currency?: unknown; availability?: string }; extensions?: string[] } } }>; error?: string };
    if (body.error) { this.googleDiagnostics = { status: "provider_error", pricedOffers: 0, organicResults: 0, parsedOffers: 0, durationMs: Date.now() - startedAt, error: body.error.slice(0, 160) }; return []; }
    const product = body.product_result;
    this.googleDetailCandidates = (body.immersive_products || []).flatMap((item, index) => {
      if (!item.title || !item.immersive_product_page_token) return [];
      const titleTokens = shopperTokens(item.title);
      const queryTokens = shopperTokens(query.query);
      const relevance = queryTokens.length ? Math.round(queryTokens.filter((term) => titleTokens.some((candidate) => tokenMatches(term, candidate) || candidate === term)).length / queryTokens.length * 100) : 0;
      return [{ productId: `google-${createHash("sha256").update(item.immersive_product_page_token).digest("hex").slice(0, 20)}`, token: item.immersive_product_page_token, title: item.title, relevance, sourceQuery: query.query, sourcePosition: index + 1, imageUrls: imageUrls(item.thumbnail) }];
    }).sort((a, b) => b.relevance - a.relevance);
    const checkedAt = new Date().toISOString();
    const priced = (product?.pricing || []).flatMap((offer, index) => {
      const productUrl = validUrl(offer.link);
      const price = typeof offer.extracted_price === "number" && offer.extracted_price >= 0 ? offer.extracted_price : null;
      if (!productUrl || price == null) return [];
      const imageUrl = validUrl(offer.thumbnail);
      const title = offer.description || product?.title;
      if (!title) return [];
      const base = { id: `google-${createHash("sha256").update(`${productUrl}|${price}`).digest("hex").slice(0, 24)}`, provider: "serpapi-google", title, price, previousPrice: null, currency: "BRL" as const, store: offer.name || null, merchant: normalizeShopperMerchant(offer.name), brand: null, imageUrl, imageUrls: imageUrl ? [imageUrl] : [], imageSource: imageUrl ? "thumbnail" as const : null, productUrl, rating: validRating(product?.rating), reviewCount: validReviewCount(product?.reviews), shipping: offer.buying_options?.find((option) => /frete|entrega|delivery/i.test(option)) || null, availability: availabilityFromSource(offer), discountPercent: null, productId: null, checkedAt, sourceQuery: query.query, sourcePosition: index + 1, productTitle: product?.title || title, attributesText: offer.description || null };
      return [{ ...base, match: score(base, query), reason: "Oferta encontrada na busca exata do Google." }];
    });
    const organic = (body.organic_results || []).flatMap((item, index) => {
      const productUrl = validUrl(item.link);
      if (!productUrl || !item.title) return [];
      const imageUrl = validUrl(item.thumbnail);
      const price = parseOrganicPrice(item);
      const base = { id: `organic-${createHash("sha256").update(productUrl).digest("hex").slice(0, 24)}`, provider: "serpapi-google-organic", title: item.title, price, previousPrice: null, currency: "BRL" as const, store: item.source || null, merchant: normalizeShopperMerchant(item.source), brand: null, imageUrl, imageUrls: imageUrl ? [imageUrl] : [], imageSource: imageUrl ? "thumbnail" as const : null, productUrl, rating: null, reviewCount: null, shipping: null, availability: availabilityFromSource({ ...item, availability: item.availability || item.rich_snippet?.top?.detected_extensions?.availability || item.rich_snippet?.bottom?.detected_extensions?.availability }), discountPercent: null, productId: null, checkedAt, sourceQuery: query.query, sourcePosition: item.position ?? index + 1, productTitle: item.title, attributesText: item.snippet || null };
      return [{ ...base, match: score(base, query), reason: price != null ? "Oferta encontrada na busca Google." : "Resultado encontrado na busca Google; preço não informado." }];
    });
    const shopping = this.parseShoppingItems(body.shopping_results || [], query, query.query, "serpapi-google-shopping-inline");
    this.googleDetailCandidates.push(...shopping.detailCandidates);
    this.googleDiagnostics = { status: product?.pricing?.length ? "product_block" : this.googleDetailCandidates.length ? "immersive_products" : "organic_only", pricedOffers: priced.length + shopping.results.filter((item) => item.price != null).length + organic.filter((item) => item.price != null).length, organicResults: body.organic_results?.length || 0, immersiveProducts: body.immersive_products?.length || 0, parsedOffers: priced.length + shopping.results.length + organic.length, durationMs: Date.now() - startedAt };
    return [...priced, ...shopping.results, ...organic];
  }

  async searchDetailed(query: ShopperQuery, phrase: string, engine: "google_shopping" | "google_shopping_light" = "google_shopping"): Promise<{ results: SearchedProduct[]; detailCandidates: ProductDetailCandidate[]; rawCount: number }> {
    const startedAt = Date.now();
    if (!this.available()) return { results: [], detailCandidates: [], rawCount: 0 };
    const params = new URLSearchParams({ engine, q: phrase, gl: "br", hl: "pt-br", api_key: env.serpApi.apiKey });
    // Google Shopping via SerpApi pode retornar uma lista vazia no Brasil quando
    // recebe max_price, mesmo havendo itens abaixo do teto. Buscamos o catálogo
    // normal e aplicamos o limite rígido localmente em visibleResults().
    let response: Response;
    try {
      response = await fetch(`https://serpapi.com/search.json?${params}`, { signal: AbortSignal.timeout(engine === "google_shopping_light" ? 20_000 : 30_000) });
    } catch (error) {
      this.shoppingDiagnostics.push({ phrase, engine, status: "request_failed", rawCount: 0, parsedCount: 0, durationMs: Date.now() - startedAt, error: error instanceof Error ? error.name : "unknown" });
      throw new AppError("A busca nas lojas demorou mais que o esperado. Tente novamente.", 503);
    }
    if (!response.ok) { this.shoppingDiagnostics.push({ phrase, engine, status: "http_error", rawCount: 0, parsedCount: 0, durationMs: Date.now() - startedAt, error: String(response.status) }); throw new Error("Não foi possível consultar o Google Shopping agora."); }
    const body = await response.json() as { shopping_results?: SerpResult[]; inline_shopping_results?: SerpResult[]; categorized_shopping_results?: Array<{ shopping_results?: SerpResult[] }>; error?: string };
    if (body.error) { this.shoppingDiagnostics.push({ phrase, engine, status: "provider_error", rawCount: 0, parsedCount: 0, durationMs: Date.now() - startedAt, error: body.error.slice(0, 160) }); throw new AppError("A fonte de shopping não conseguiu concluir a busca.", 503); }
    const raw = [...(body.shopping_results || []), ...(body.inline_shopping_results || []), ...(body.categorized_shopping_results || []).flatMap((category) => category.shopping_results || [])];
    const { results, detailCandidates } = this.parseShoppingItems(raw, query, phrase, this.id);
    this.shoppingDiagnostics.push({ phrase, engine, status: "ok", rawCount: raw.length, parsedCount: results.length, durationMs: Date.now() - startedAt });
    return { results, detailCandidates, rawCount: raw.length };
  }

  async offersFor(candidate: ProductDetailCandidate, query: ShopperQuery, nextPageToken?: string): Promise<SearchedProduct[]> {
    const params = new URLSearchParams({ engine: "google_immersive_product", page_token: candidate.token, more_stores: "true", api_key: env.serpApi.apiKey });
    if (nextPageToken) params.set("next_page_token", nextPageToken);
    const response = await fetch(`https://serpapi.com/search.json?${params}`, { signal: AbortSignal.timeout(nextPageToken ? 6_000 : 25_000) });
    if (!response.ok) return [];
    const body = await response.json() as { product_results?: { title?: string; description?: string; images?: unknown; image?: unknown; product_images?: unknown; specifications?: unknown; stores_next_page_token?: string; stores?: Array<{ name?: string; title?: string; link?: string; rating?: number; reviews?: number; availability?: string; in_stock?: boolean; out_of_stock?: boolean; stock?: string | number; extracted_price?: number; extracted_total?: number; shipping_extracted?: number; installments_description?: string; extracted_original_price?: number; shipping?: string; details_and_offers?: string[]; thumbnail?: string; image?: unknown; images?: unknown; product_details?: unknown }> }; error?: string };
    if (body.error) return [];
    const checkedAt = new Date().toISOString();
    const product = body.product_results || {};
    if (product.stores_next_page_token) this.nextStorePageTokens.set(candidate.token, product.stores_next_page_token);
    else this.nextStorePageTokens.delete(candidate.token);
    const productImages = imageUrls(candidate.imageUrls, product.images, product.image, product.product_images);
    const attributesText = [product.title, product.description, JSON.stringify(product.specifications || "")].filter(Boolean).join(" ");
    return (product.stores || []).flatMap((store, index) => {
      const productUrl = validUrl(store.link);
      if (!productUrl || !store.title) return [];
      const price = resolveStorePrice(store);
      const previousPrice = typeof store.extracted_original_price === "number" && store.extracted_original_price > (price ?? Infinity) ? store.extracted_original_price : null;
      const images = imageUrls(store.thumbnail, store.image, store.images, productImages);
      const base = { id: `offer-${createHash("sha256").update(`${candidate.productId}|${productUrl}|${store.name || ""}|${price ?? ""}|${index}`).digest("hex").slice(0, 24)}`, provider: "serpapi-google-immersive-product", title: store.title, price, previousPrice, currency: "BRL" as const, store: store.name || null, merchant: normalizeShopperMerchant(store.name), brand: null, imageUrl: images[0] || null, imageUrls: images, imageSource: images.length ? "product-detail" as const : null, productUrl, rating: validRating(store.rating), reviewCount: validReviewCount(store.reviews), shipping: store.shipping || store.details_and_offers?.find((item) => /frete|entrega|shipping|delivery/i.test(item)) || null, availability: availabilityFromSource(store), discountPercent: price != null && previousPrice != null ? Math.round((1 - price / previousPrice) * 100) : null, productId: candidate.productId, checkedAt, sourceQuery: candidate.sourceQuery, sourcePosition: candidate.sourcePosition, productTitle: product.title || candidate.title, attributesText };
      const match = score(base, query);
      return [{ ...base, match, reason: "Oferta encontrada em lojas relacionadas ao produto." }];
    });
  }
}
