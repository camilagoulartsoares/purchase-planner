import { env } from "../config/env.js";
import { createHash } from "node:crypto";
import { AppError } from "../middlewares/errorHandler.js";
import type { ProductSearchProvider, SearchedProduct, ShopperQuery } from "./productSearchProvider.js";
import { normalizeShopperMerchant } from "./shopperMerchantService.js";
import { normalizeShopperText } from "./shopperIntentService.js";

type SerpResult = {
  position?: number; product_id?: string; title?: string; link?: string; product_link?: string; source?: string;
  extracted_price?: number; extracted_old_price?: number; thumbnail?: string; rating?: number; reviews?: number;
  delivery?: string; availability?: string; extensions?: string[];
  multiple_sources?: boolean; immersive_product_page_token?: string;
  images?: Array<{ thumbnail?: string; link?: string; image?: string }>;
};

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
  return normalizeShopperText(value).split(/[^a-z0-9]+/).filter((word) => word.length > 2);
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
  googleDiagnostics: { status: string; pricedOffers: number; organicResults: number; parsedOffers: number; error?: string } = { status: "not_requested", pricedOffers: 0, organicResults: 0, parsedOffers: 0 };
  shoppingDiagnostics: Array<{ phrase: string; engine: string; status: string; rawCount: number; parsedCount: number; error?: string }> = [];
  available() { return Boolean(env.serpApi.apiKey); }

  async search(query: ShopperQuery) { return (await this.searchDetailed(query, query.query)).results; }

  async searchGoogleResults(query: ShopperQuery): Promise<SearchedProduct[]> {
    if (!this.available()) return [];
    const params = new URLSearchParams({ engine: "google", q: query.query, gl: "br", hl: "pt-br", api_key: env.serpApi.apiKey });
    let response: Response;
    try { response = await fetch(`https://serpapi.com/search.json?${params}`, { signal: AbortSignal.timeout(35_000) }); }
    catch (error) { this.googleDiagnostics = { status: "request_failed", pricedOffers: 0, organicResults: 0, parsedOffers: 0, error: error instanceof Error ? error.name : "unknown" }; return []; }
    if (!response.ok) { this.googleDiagnostics = { status: "http_error", pricedOffers: 0, organicResults: 0, parsedOffers: 0, error: String(response.status) }; return []; }
    const body = await response.json() as { product_result?: { title?: string; rating?: number; reviews?: number; pricing?: Array<{ name?: string; description?: string; link?: string; extracted_price?: number; thumbnail?: string; buying_options?: string[] }> }; organic_results?: Array<{ title?: string; link?: string; source?: string; snippet?: string; thumbnail?: string; position?: number }>; error?: string };
    if (body.error) { this.googleDiagnostics = { status: "provider_error", pricedOffers: 0, organicResults: 0, parsedOffers: 0, error: body.error.slice(0, 160) }; return []; }
    const product = body.product_result;
    const checkedAt = new Date().toISOString();
    const priced = (product?.pricing || []).flatMap((offer, index) => {
      const productUrl = validUrl(offer.link);
      const price = typeof offer.extracted_price === "number" && offer.extracted_price >= 0 ? offer.extracted_price : null;
      if (!productUrl || price == null) return [];
      const imageUrl = validUrl(offer.thumbnail);
      const title = offer.description || product?.title;
      if (!title) return [];
      const base = { id: `google-${createHash("sha256").update(`${productUrl}|${price}`).digest("hex").slice(0, 24)}`, provider: "serpapi-google", title, price, previousPrice: null, currency: "BRL" as const, store: offer.name || null, merchant: normalizeShopperMerchant(offer.name), brand: null, imageUrl, imageUrls: imageUrl ? [imageUrl] : [], imageSource: imageUrl ? "thumbnail" as const : null, productUrl, rating: typeof product?.rating === "number" ? product.rating : null, reviewCount: typeof product?.reviews === "number" ? product.reviews : null, shipping: offer.buying_options?.find((option) => /frete|entrega|delivery/i.test(option)) || null, availability: offer.buying_options?.find((option) => /estoque|stock/i.test(option)) || null, discountPercent: null, productId: null, checkedAt, sourceQuery: query.query, sourcePosition: index + 1, productTitle: product?.title || title, attributesText: offer.description || null };
      return [{ ...base, match: score(base, query), reason: "Oferta encontrada na busca exata do Google." }];
    });
    const organic = (body.organic_results || []).flatMap((item, index) => {
      const productUrl = validUrl(item.link);
      if (!productUrl || !item.title) return [];
      const imageUrl = validUrl(item.thumbnail);
      const base = { id: `organic-${createHash("sha256").update(productUrl).digest("hex").slice(0, 24)}`, provider: "serpapi-google-organic", title: item.title, price: null, previousPrice: null, currency: "BRL" as const, store: item.source || null, merchant: normalizeShopperMerchant(item.source), brand: null, imageUrl, imageUrls: imageUrl ? [imageUrl] : [], imageSource: imageUrl ? "thumbnail" as const : null, productUrl, rating: null, reviewCount: null, shipping: null, availability: null, discountPercent: null, productId: null, checkedAt, sourceQuery: query.query, sourcePosition: item.position ?? index + 1, productTitle: item.title, attributesText: item.snippet || null };
      return [{ ...base, match: score(base, query), reason: "Resultado encontrado na busca Google; preço não informado." }];
    });
    this.googleDiagnostics = { status: product?.pricing?.length ? "product_block" : "organic_only", pricedOffers: product?.pricing?.length || 0, organicResults: body.organic_results?.length || 0, parsedOffers: priced.length + organic.length };
    return [...priced, ...organic];
  }

  async searchDetailed(query: ShopperQuery, phrase: string, engine: "google_shopping" | "google_shopping_light" = "google_shopping"): Promise<{ results: SearchedProduct[]; detailCandidates: ProductDetailCandidate[]; rawCount: number }> {
    if (!this.available()) return { results: [], detailCandidates: [], rawCount: 0 };
    const params = new URLSearchParams({ engine, q: phrase, gl: "br", hl: "pt-br", api_key: env.serpApi.apiKey });
    // Google Shopping via SerpApi pode retornar uma lista vazia no Brasil quando
    // recebe max_price, mesmo havendo itens abaixo do teto. Buscamos o catálogo
    // normal e aplicamos o limite rígido localmente em visibleResults().
    let response: Response;
    try {
      response = await fetch(`https://serpapi.com/search.json?${params}`, { signal: AbortSignal.timeout(engine === "google_shopping_light" ? 20_000 : 30_000) });
    } catch (error) {
      this.shoppingDiagnostics.push({ phrase, engine, status: "request_failed", rawCount: 0, parsedCount: 0, error: error instanceof Error ? error.name : "unknown" });
      throw new AppError("A busca nas lojas demorou mais que o esperado. Tente novamente.", 503);
    }
    if (!response.ok) { this.shoppingDiagnostics.push({ phrase, engine, status: "http_error", rawCount: 0, parsedCount: 0, error: String(response.status) }); throw new Error("Não foi possível consultar o Google Shopping agora."); }
    const body = await response.json() as { shopping_results?: SerpResult[]; inline_shopping_results?: SerpResult[]; error?: string };
    if (body.error) { this.shoppingDiagnostics.push({ phrase, engine, status: "provider_error", rawCount: 0, parsedCount: 0, error: body.error.slice(0, 160) }); throw new AppError("A fonte de shopping não conseguiu concluir a busca.", 503); }
    const raw = [...(body.shopping_results || []), ...(body.inline_shopping_results || [])];
    const detailCandidates: ProductDetailCandidate[] = [];
    const seen = new Set<string>();
    const checkedAt = new Date().toISOString();
    const results = raw.flatMap((item, index) => {
      const productUrl = validUrl(item.link) || validUrl(item.product_link);
      if (!productUrl || !item.title || seen.has(productUrl)) return [];
      seen.add(productUrl);
      const price = typeof item.extracted_price === "number" && item.extracted_price >= 0 ? item.extracted_price : null;
      const previousPrice = typeof item.extracted_old_price === "number" && item.extracted_old_price >= 0 ? item.extracted_old_price : null;
      const images = imageUrls(item.thumbnail, item.images);
      const base = { id: `search-${createHash("sha256").update(`${productUrl}|${item.source || ""}|${price ?? ""}`).digest("hex").slice(0, 24)}`, provider: this.id, title: item.title, price, previousPrice, currency: "BRL" as const, store: item.source || null, merchant: normalizeShopperMerchant(item.source), brand: null, imageUrl: images[0] || null, imageUrls: images, imageSource: images.length ? "thumbnail" as const : null, productUrl, rating: typeof item.rating === "number" ? item.rating : null, reviewCount: typeof item.reviews === "number" ? item.reviews : null, shipping: item.delivery || null, availability: item.availability || null, discountPercent: price != null && previousPrice != null && previousPrice > price ? Math.round(((previousPrice - price) / previousPrice) * 100) : null, productId: item.product_id || null, checkedAt, sourceQuery: phrase, sourcePosition: item.position ?? index + 1, productTitle: item.title };
      const match = score(base, query);
      if (item.multiple_sources && item.product_id && item.immersive_product_page_token) detailCandidates.push({ productId: item.product_id, token: item.immersive_product_page_token, title: item.title, relevance: match.total, sourceQuery: phrase, sourcePosition: item.position ?? index + 1, imageUrls: images });
      const reason = query.maxPrice != null && price != null && price <= query.maxPrice ? "Dentro do orçamento informado." : match.query >= 70 ? "Uma das opções mais próximas do que você pediu." : "Resultado encontrado nas fontes consultadas.";
      return [{ ...base, match, reason }];
    }).sort((a, b) => b.match.total - a.match.total || (a.price ?? Infinity) - (b.price ?? Infinity));
    this.shoppingDiagnostics.push({ phrase, engine, status: "ok", rawCount: raw.length, parsedCount: results.length });
    return { results, detailCandidates, rawCount: raw.length };
  }

  async offersFor(candidate: ProductDetailCandidate, query: ShopperQuery): Promise<SearchedProduct[]> {
    const params = new URLSearchParams({ engine: "google_immersive_product", page_token: candidate.token, more_stores: "true", api_key: env.serpApi.apiKey });
    const response = await fetch(`https://serpapi.com/search.json?${params}`, { signal: AbortSignal.timeout(25_000) });
    if (!response.ok) return [];
    const body = await response.json() as { product_results?: { title?: string; description?: string; images?: unknown; image?: unknown; product_images?: unknown; specifications?: unknown; stores?: Array<{ name?: string; title?: string; link?: string; extracted_price?: number; extracted_original_price?: number; shipping?: string; details_and_offers?: string[]; thumbnail?: string; image?: unknown; images?: unknown; product_details?: unknown }> }; error?: string };
    if (body.error) return [];
    const checkedAt = new Date().toISOString();
    const product = body.product_results || {};
    const productImages = imageUrls(candidate.imageUrls, product.images, product.image, product.product_images);
    const attributesText = [product.title, product.description, JSON.stringify(product.specifications || "")].filter(Boolean).join(" ");
    return (product.stores || []).flatMap((store, index) => {
      const productUrl = validUrl(store.link);
      if (!productUrl || !store.title) return [];
      const price = typeof store.extracted_price === "number" && store.extracted_price >= 0 ? store.extracted_price : null;
      const previousPrice = typeof store.extracted_original_price === "number" && store.extracted_original_price > (price ?? Infinity) ? store.extracted_original_price : null;
      const images = imageUrls(store.thumbnail, store.image, store.images, productImages);
      const base = { id: `offer-${createHash("sha256").update(`${candidate.productId}|${productUrl}|${store.name || ""}|${price ?? ""}|${index}`).digest("hex").slice(0, 24)}`, provider: "serpapi-google-immersive-product", title: store.title, price, previousPrice, currency: "BRL" as const, store: store.name || null, merchant: normalizeShopperMerchant(store.name), brand: null, imageUrl: images[0] || null, imageUrls: images, imageSource: images.length ? "product-detail" as const : null, productUrl, rating: null, reviewCount: null, shipping: store.shipping || store.details_and_offers?.find((item) => /frete|entrega|shipping|delivery/i.test(item)) || null, availability: null, discountPercent: price != null && previousPrice != null ? Math.round((1 - price / previousPrice) * 100) : null, productId: candidate.productId, checkedAt, sourceQuery: candidate.sourceQuery, sourcePosition: candidate.sourcePosition, productTitle: product.title || candidate.title, attributesText };
      const match = score(base, query);
      return [{ ...base, match, reason: "Oferta encontrada em lojas relacionadas ao produto." }];
    });
  }
}
