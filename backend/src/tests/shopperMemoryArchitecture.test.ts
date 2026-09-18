import { describe, expect, it, vi } from "vitest";
import { createShopperCallBudget, offerPriceStatus, shopperRuntime } from "../config/shopperRuntime.js";
import { compatibleProductIntent, interpretShopperIntent } from "../services/shopperIntentService.js";
import { createInMemoryShopperCatalogStore, createShopperCatalogMemory } from "../services/shopperCatalogMemory.js";
import { discoverProducts, presentShopperOffers, selectDetailCandidates } from "../services/shopperDiscoveryService.js";
import { SerpApiProductSearchProvider } from "../services/serpApiProductSearchProvider.js";
import { shopperSearchCache } from "../services/shopperSearchCache.js";
import type { SearchedProduct } from "../services/productSearchProvider.js";

function offer(title: string, store: string, price: number, url = `https://${store.replace(/\s+/g, "").toLowerCase()}.example/${price}`, extra: Partial<SearchedProduct> = {}): SearchedProduct {
  return { id: url, provider: "fixture", title, productTitle: title, price, previousPrice: null, currency: "BRL", store, brand: null, imageUrl: null, productUrl: url, rating: null, reviewCount: null, shipping: null, availability: null, discountPercent: null, match: { query: 90, budget: 50, style: 50, completeness: 60, total: 90 }, reason: "", checkedAt: extra.checkedAt || new Date().toISOString(), ...extra };
}

describe("shopper persistent memory and budget", () => {
  it("A. reuses memory for the same query after a new service instance", async () => {
    const store = createInMemoryShopperCatalogStore();
    const first = createShopperCatalogMemory(store);
    const query = interpretShopperIntent("kit shampoo condicionador wella invigo 1l", null);
    await first.remember("user-1", query, [offer("Kit Shampoo e Condicionador Wella Invigo 1L", "Loja A", 280)]);
    shopperSearchCache.clear();
    const second = createShopperCatalogMemory(store);
    const recalled = await second.recall("user-1", query);
    expect(recalled.used).toBe(true);
    expect(recalled.reason).toBe("compatible_intent_map");
    expect(recalled.offers).toHaveLength(1);
  });

  it("B. reuses memory for a semantically equivalent query", async () => {
    const memory = createShopperCatalogMemory(createInMemoryShopperCatalogStore());
    const first = interpretShopperIntent("kit shampoo condicionador Wella Invigo 1L", null);
    const second = interpretShopperIntent("Wella Invigo shampoo e condicionador até 250", null);
    expect(compatibleProductIntent(first, second)).toBe(true);
    await memory.remember("user-1", first, [offer("Kit Shampoo e Condicionador Wella Invigo 1L", "Loja A", 220)]);
    const recalled = await memory.recall("user-1", second);
    expect(recalled.used).toBe(true);
    expect(presentShopperOffers(recalled.offers, second).results).toHaveLength(1);
  });

  it("C. a price ceiling change does not require a new discovery", async () => {
    const memory = createShopperCatalogMemory(createInMemoryShopperCatalogStore());
    const open = interpretShopperIntent("kit shampoo condicionador Wella Invigo 1L", null);
    const capped = interpretShopperIntent("kit Wella Invigo 1L até 298 reais", null);
    expect(compatibleProductIntent(open, capped)).toBe(true);
    await memory.remember("user-1", open, [
      offer("Kit Shampoo e Condicionador Wella Invigo 1L", "Loja A", 220),
      offer("Kit Shampoo e Condicionador Wella Invigo 1L", "Loja B", 340),
    ]);
    const recalled = await memory.recall("user-1", capped);
    expect(recalled.used).toBe(true);
    expect(recalled.offers).toHaveLength(2);
    expect(presentShopperOffers(recalled.offers, capped).results.map((item) => item.store)).toEqual(["Loja A"]);
  });

  it("D. a truly different product does not reuse memory", async () => {
    const memory = createShopperCatalogMemory(createInMemoryShopperCatalogStore());
    const wella = interpretShopperIntent("kit shampoo condicionador Wella Invigo 1L", null);
    const notebook = interpretShopperIntent("notebook lenovo i5 16gb", null);
    expect(compatibleProductIntent(wella, notebook)).toBe(false);
    await memory.remember("user-1", wella, [offer("Kit Shampoo e Condicionador Wella Invigo 1L", "Loja A", 220)]);
    const recalled = await memory.recall("user-1", notebook);
    expect(recalled.used).toBe(false);
  });

  it("E. an old price is marked aged", () => {
    const old = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(offerPriceStatus(old)).toBe("aged");
    expect(offerPriceStatus(new Date().toISOString())).toBe("fresh");
    const presented = presentShopperOffers([offer("Panela Tramontina 24cm", "Loja A", 120, undefined, { checkedAt: old })], interpretShopperIntent("panela tramontina 24cm", null));
    expect(presented.results[0].priceStatus).toBe("aged");
  });

  it("F. refresh respects the refresh budget", async () => {
    const query = interpretShopperIntent("panela tramontina 24cm", null);
    const provider = new SerpApiProductSearchProvider();
    provider.googleDetailCandidates = Array.from({ length: 8 }, (_, index) => ({ productId: `p${index}`, token: `t${index}`, title: query.query, relevance: 90, sourceQuery: query.query, sourcePosition: index + 1, imageUrls: [] }));
    vi.spyOn(provider, "searchGoogleResults").mockResolvedValue([]);
    const search = vi.spyOn(provider, "searchDetailed").mockResolvedValue({ results: [], detailCandidates: [], rawCount: 0 });
    const details = vi.spyOn(provider, "offersFor").mockResolvedValue([offer(query.query, "Loja A", 120, `https://a.example/${Math.random()}`)]);
    const budget = createShopperCallBudget(shopperRuntime.budget.refresh);
    const result = await discoverProducts(query, provider, { budget, mode: "refresh", skipSearch: true, knownCandidates: provider.googleDetailCandidates });
    expect(budget.total()).toBeLessThanOrEqual(shopperRuntime.budget.refresh.maxCalls);
    expect(budget.spent.detail).toBeLessThanOrEqual(shopperRuntime.budget.refresh.maxDetail);
    expect(search).not.toHaveBeenCalled();
    expect(details.mock.calls.length).toBeLessThanOrEqual(shopperRuntime.budget.refresh.maxDetail);
    expect(result.metrics.searchCalls).toBe(0);
  });

  it("G. a card above the ceiling can still be opened", () => {
    const query = interpretShopperIntent("panela tramontina 24cm até 200 reais", null);
    const expensive = { productId: "expensive", token: "expensive", title: "Panela Tramontina 24cm", relevance: 90, sourceQuery: query.query, sourcePosition: 1, imageUrls: [] as string[], indicativePrice: 230, indicativeStore: "Loja A" };
    expect(selectDetailCandidates([expensive], query, 1)).toEqual([expensive]);
  });

  it("H. multiple_sources ranks a card ahead of an otherwise similar lead", () => {
    const query = interpretShopperIntent("panela tramontina 24cm até 200 reais", null);
    const single = { productId: "single", token: "single", title: "Panela Tramontina 24cm inox", relevance: 90, sourceQuery: query.query, sourcePosition: 1, imageUrls: [] as string[], indicativePrice: 180, indicativeStore: "Loja A", multipleSources: false };
    const many = { productId: "many", token: "many", title: "Panela Tramontina 24cm antiaderente", relevance: 80, sourceQuery: query.query, sourcePosition: 2, imageUrls: [] as string[], indicativePrice: 210, indicativeStore: "Loja B", multipleSources: true };
    expect(selectDetailCandidates([single, many], query, 1).map((item) => item.productId)).toEqual(["many"]);
  });

  it("I. a detail offer below the ceiling is kept even if the card looked expensive", async () => {
    const query = interpretShopperIntent("panela tramontina 24cm até 200 reais", null);
    const provider = new SerpApiProductSearchProvider();
    provider.googleDetailCandidates = [{ productId: "p1", token: "p1", title: "Panela Tramontina 24cm", relevance: 90, sourceQuery: query.query, sourcePosition: 1, imageUrls: [], indicativePrice: 230, multipleSources: true }];
    vi.spyOn(provider, "searchDetailed").mockResolvedValue({ results: [], detailCandidates: provider.googleDetailCandidates, rawCount: 0 });
    vi.spyOn(provider, "searchGoogleResults").mockResolvedValue([]);
    vi.spyOn(provider, "offersFor").mockResolvedValue([offer("Panela Tramontina 24cm", "Loja Barata", 156)]);
    const result = await discoverProducts(query, provider);
    expect(result.results).toEqual(expect.arrayContaining([expect.objectContaining({ store: "Loja Barata", price: 156 })]));
  });

  it("J. dedup keeps commercially different stores and prices", () => {
    const query = interpretShopperIntent("panela tramontina 24cm", null);
    const presented = presentShopperOffers([
      offer("Panela Tramontina 24cm", "Loja A", 120, "https://shop.example/p"),
      offer("Panela Tramontina 24cm", "Loja B", 120, "https://shop.example/p"),
      offer("Panela Tramontina 24cm", "Loja A", 130, "https://shop.example/p"),
      offer("Panela Tramontina 24cm", "Loja A", 120, "https://shop.example/p"),
    ], query);
    expect(presented.results).toHaveLength(3);
  });

  it("K. a new discovery never exceeds the centralized call cap", async () => {
    const query = interpretShopperIntent("notebook lenovo 16gb", null);
    const provider = new SerpApiProductSearchProvider();
    provider.googleDetailCandidates = Array.from({ length: 20 }, (_, index) => ({ productId: `p${index}`, token: `t${index}`, title: "Notebook Lenovo 16GB", relevance: 90, sourceQuery: query.query, sourcePosition: index + 1, imageUrls: [], multipleSources: index === 0 }));
    const search = vi.spyOn(provider, "searchDetailed").mockResolvedValue({ results: [], detailCandidates: [], rawCount: 0 });
    vi.spyOn(provider, "searchGoogleResults").mockResolvedValue([]);
    const details = vi.spyOn(provider, "offersFor").mockImplementation(async (candidate) => Array.from({ length: candidate.multipleSources ? 8 : 1 }, (_, index) => offer("Notebook Lenovo 16GB", `Loja ${candidate.productId}-${index}`, 3000 + index)));
    const result = await discoverProducts(query, provider);
    expect(search.mock.calls.length + details.mock.calls.length).toBeLessThanOrEqual(shopperRuntime.budget.discovery.maxCalls);
    expect(result.metrics.searchCalls + result.metrics.detailCalls + result.metrics.storePageCalls).toBeLessThanOrEqual(shopperRuntime.budget.discovery.maxCalls);
  });

  it("L. fallback search only runs when the shopping map is not healthy", async () => {
    const query = interpretShopperIntent("panela tramontina 24cm", null);
    const provider = new SerpApiProductSearchProvider();
    const search = vi.spyOn(provider, "searchDetailed").mockResolvedValue({
      results: Array.from({ length: 6 }, (_, index) => offer(query.query, `Loja ${index}`, 120 + index)),
      detailCandidates: Array.from({ length: 4 }, (_, index) => ({ productId: `p${index}`, token: `t${index}`, title: query.query, relevance: 90, sourceQuery: query.query, sourcePosition: index + 1, imageUrls: [] })),
      rawCount: 6,
    });
    const google = vi.spyOn(provider, "searchGoogleResults").mockResolvedValue([]);
    vi.spyOn(provider, "offersFor").mockResolvedValue([]);
    const result = await discoverProducts(query, provider);
    expect(search.mock.calls).toEqual([[query, query.query, "google_shopping"]]);
    expect(google).not.toHaveBeenCalled();
    expect(result.metrics.queries).toEqual([query.query]);
  });

  it("M. memory survives clearing the RAM map because it lives in the catalog store", async () => {
    const store = createInMemoryShopperCatalogStore();
    const memory = createShopperCatalogMemory(store);
    const query = interpretShopperIntent("air fryer 5 litros", null);
    await memory.remember("user-1", query, [offer("Air Fryer 5L", "Loja A", 299)]);
    shopperSearchCache.set("c1", query, [offer("Air Fryer 5L", "Loja A", 299)]);
    shopperSearchCache.clear();
    expect(shopperSearchCache.get("c1", query)).toBeNull();
    expect((await memory.recall("user-1", query)).used).toBe(true);
  });
});
