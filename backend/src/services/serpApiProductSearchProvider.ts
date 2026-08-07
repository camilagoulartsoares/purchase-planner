import { env } from "../config/env.js";
import { AppError } from "../middlewares/errorHandler.js";
import type { ProductSearchProvider, SearchedProduct, ShopperQuery } from "./productSearchProvider.js";

type SerpResult = {
  position?: number; product_id?: string; title?: string; link?: string; product_link?: string; source?: string;
  extracted_price?: number; extracted_old_price?: number; thumbnail?: string; rating?: number; reviews?: number;
  delivery?: string; availability?: string; extensions?: string[];
};

function validUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try { const url = new URL(value); return /^https?:$/.test(url.protocol) ? url.toString() : null; } catch { return null; }
}

function words(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2);
}

function score(result: Omit<SearchedProduct, "match" | "reason">, query: ShopperQuery) {
  const title = words(result.title);
  const requested = words([query.query, ...query.colors, ...query.style, ...query.brands].join(" "));
  const queryScore = requested.length ? Math.round((requested.filter((word) => title.includes(word)).length / requested.length) * 100) : 50;
  const budgetScore = query.maxPrice == null || result.price == null ? 50 : result.price <= query.maxPrice ? 100 : Math.max(0, 100 - ((result.price - query.maxPrice) / query.maxPrice) * 100);
  const styleScore = query.style.length + query.colors.length ? Math.min(100, queryScore + 10) : 50;
  const completeness = [result.imageUrl, result.store, result.price, result.productUrl, result.rating].filter((item) => item != null).length * 20;
  return { query: queryScore, budget: Math.round(budgetScore), style: styleScore, completeness, total: Math.round(queryScore * .45 + budgetScore * .3 + styleScore * .1 + completeness * .15) };
}

export class SerpApiProductSearchProvider implements ProductSearchProvider {
  readonly id = "serpapi-google-shopping";
  available() { return Boolean(env.serpApi.apiKey); }

  async search(query: ShopperQuery) {
    if (!this.available()) return [];
    const params = new URLSearchParams({ engine: "google_shopping", q: query.query, gl: "br", hl: "pt-br", num: "20", api_key: env.serpApi.apiKey });
    if (query.maxPrice != null) params.set("max_price", String(query.maxPrice));
    let response: Response;
    try {
      response = await fetch(`https://serpapi.com/search.json?${params}`, { signal: AbortSignal.timeout(35_000) });
    } catch {
      throw new AppError("A busca nas lojas demorou mais que o esperado. Tente novamente.", 503);
    }
    if (!response.ok) throw new Error("Não foi possível consultar o Google Shopping agora.");
    const body = await response.json() as { shopping_results?: SerpResult[] };
    const seen = new Set<string>();
    return (body.shopping_results || []).flatMap((item, index) => {
      const productUrl = validUrl(item.link) || validUrl(item.product_link);
      if (!productUrl || !item.title || seen.has(productUrl)) return [];
      seen.add(productUrl);
      const price = typeof item.extracted_price === "number" && item.extracted_price >= 0 ? item.extracted_price : null;
      const previousPrice = typeof item.extracted_old_price === "number" && item.extracted_old_price >= 0 ? item.extracted_old_price : null;
      const base = { id: item.product_id || `serp-${item.position || index}-${Buffer.from(productUrl).toString("base64url").slice(0, 20)}`, provider: this.id, title: item.title, price, previousPrice, currency: "BRL" as const, store: item.source || null, brand: null, imageUrl: validUrl(item.thumbnail), productUrl, rating: typeof item.rating === "number" ? item.rating : null, reviewCount: typeof item.reviews === "number" ? item.reviews : null, shipping: item.delivery || null, availability: item.availability || null, discountPercent: price != null && previousPrice != null && previousPrice > price ? Math.round(((previousPrice - price) / previousPrice) * 100) : null };
      const match = score(base, query);
      const reason = query.maxPrice != null && price != null && price <= query.maxPrice ? "Dentro do orçamento informado." : match.query >= 70 ? "Uma das opções mais próximas do que você pediu." : "Resultado encontrado nas fontes consultadas.";
      return [{ ...base, match, reason }];
    }).sort((a, b) => b.match.total - a.match.total || (a.price ?? Infinity) - (b.price ?? Infinity));
  }
}
