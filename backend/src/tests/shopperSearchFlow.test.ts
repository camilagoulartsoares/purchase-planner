import { afterEach, describe, expect, it, vi } from "vitest";
import { interpretShopperIntent } from "../services/shopperIntentService.js";
import { SerpApiProductSearchProvider } from "../services/serpApiProductSearchProvider.js";
import { discoverProducts } from "../services/shopperDiscoveryService.js";
import type { SearchedProduct } from "../services/productSearchProvider.js";

afterEach(() => vi.restoreAllMocks());

describe("Personal Shopper search flow", () => {
  it("reads priced offers from the exact Google query, preserving variants of wording and units", async () => {
    const query = interpretShopperIntent("kit shampoo e condicionador wella 1l invigo", null);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      product_result: {
        title: "Kit Shampoo e Condicionador Wella Invigo Nutri Enrich 1L",
        pricing: [
          { name: "Loja A", description: "Kit Wella Invigo SH 1000ml + Cond. 1L", extracted_price: 319.9, link: "https://example.com/kit", thumbnail: "https://example.com/kit.jpg" },
          { name: "Loja B", description: "Kit Wella Invigo 1L", extracted_price: 350, link: "javascript:invalid" },
        ],
      },
    }), { status: 200 }));
    const provider = new SerpApiProductSearchProvider();
    vi.spyOn(provider, "available").mockReturnValue(true);
    const offers = await provider.searchGoogleResults(query);
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get("q")).toBe(query.query);
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({ price: 319.9, productUrl: "https://example.com/kit", store: "Loja A" });
    expect(offers[0].match.query).toBeGreaterThanOrEqual(80);
  });

  it.each([
    ["Notebook Lenovo 16GB 512GB", "Lenovo Notebook 512 GB SSD 16 GB RAM"],
    ["Tênis Nike tamanho 42", "Nike Tênis Air Tam. 42"],
    ["Perfume Dior 100ml", "Dior Perfume 100 ml"],
  ])("ranks equivalent product wording for %s", async (message, title) => {
    const query = interpretShopperIntent(message, null);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ product_result: { title, pricing: [{ name: "Loja", description: title, extracted_price: 200, link: "https://example.com/product" }] } }), { status: 200 }));
    const provider = new SerpApiProductSearchProvider();
    vi.spyOn(provider, "available").mockReturnValue(true);
    const [offer] = await provider.searchGoogleResults(query);
    expect(offer.match.query).toBeGreaterThanOrEqual(75);
  });

  it("keeps an exact relevant offer without an image and deduplicates it against Shopping", async () => {
    const query = interpretShopperIntent("kit shampoo e condicionador wella 1l invigo", null);
    const offer = (title: string, url: string, total: number): SearchedProduct => ({ id: url, provider: "fixture", title, productTitle: title, price: 319.9, previousPrice: null, currency: "BRL", store: "Loja A", brand: null, imageUrl: null, productUrl: url, rating: null, reviewCount: null, shipping: null, availability: null, discountPercent: null, match: { query: total, budget: 50, style: 50, completeness: 60, total }, reason: "" });
    const exact = offer("Kit Shampoo e Condicionador Wella Invigo Nutri Enrich 1L", "https://example.com/kit", 95);
    const duplicate = offer(exact.title, exact.productUrl, 95);
    const lessRelevant = offer("Kit Wella Invigo Shampoo 1L + Condicionador 1L", "https://example.com/other", 70);
    const provider = new SerpApiProductSearchProvider();
    vi.spyOn(provider, "searchGoogleResults").mockResolvedValue([exact]);
    const shopping = vi.spyOn(provider, "searchDetailed").mockResolvedValue({ results: [duplicate, lessRelevant], detailCandidates: [], rawCount: 2 });
    const discovered = await discoverProducts(query, provider);
    expect(discovered.results.map((result) => result.productUrl)).toEqual([exact.productUrl, lessRelevant.productUrl]);
    expect(discovered.metrics.uniqueResults).toBe(2);
    expect(discovered.variations[0].imageUrl).toBeNull();
    expect(shopping).toHaveBeenCalledTimes(5);
  });

  it("uses broader queries only when the exact results are scarce", async () => {
    const query = interpretShopperIntent("Perfume Dior 100ml", null);
    const provider = new SerpApiProductSearchProvider();
    const results = Array.from({ length: 8 }, (_, index): SearchedProduct => ({ id: String(index), provider: "fixture", title: `Perfume Dior 100ml oferta ${index}`, price: 200, previousPrice: null, currency: "BRL", store: "Loja", brand: null, imageUrl: null, productUrl: `https://example.com/${index}`, rating: null, reviewCount: null, shipping: null, availability: null, discountPercent: null, match: { query: 100, budget: 50, style: 50, completeness: 60, total: 90 }, reason: "" }));
    vi.spyOn(provider, "searchGoogleResults").mockResolvedValue(results);
    const shopping = vi.spyOn(provider, "searchDetailed").mockResolvedValue({ results: [], detailCandidates: [], rawCount: 0 });
    const discovered = await discoverProducts(query, provider);
    expect(shopping).toHaveBeenCalledTimes(2);
    expect(discovered.metrics.queries).toEqual([query.query]);
  });
});
