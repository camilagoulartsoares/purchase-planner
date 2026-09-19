import { describe, expect, it, vi } from "vitest";
import { shopperRuntime } from "../config/shopperRuntime.js";
import { interpretShopperIntent } from "../services/shopperIntentService.js";
import { createInMemoryShopperCatalogStore, createShopperCatalogMemory } from "../services/shopperCatalogMemory.js";
import { chooseNextDiscoveryAction, discoverProducts, expectedCardGain, expectedPageGain } from "../services/shopperDiscoveryService.js";
import { resolveShopperRefresh, resolveShopperSearch } from "../services/shopperLookupService.js";
import { classifyShopperProviderFailure, ShopperProviderError, shopperRefreshUnavailableUserMessage, shopperUnavailableUserMessage } from "../services/shopperProviderFailure.js";
import { SerpApiProductSearchProvider } from "../services/serpApiProductSearchProvider.js";
import type { SearchedProduct } from "../services/productSearchProvider.js";

function offer(title: string, store: string, price: number, url = `https://${store.replace(/\s+/g, "").toLowerCase()}.example/${price}`, extra: Partial<SearchedProduct> = {}): SearchedProduct {
  return { id: url, provider: "fixture", title, productTitle: title, price, previousPrice: null, currency: "BRL", store, brand: null, imageUrl: null, productUrl: url, rating: null, reviewCount: null, shipping: null, availability: null, discountPercent: null, match: { query: 90, budget: 50, style: 50, completeness: 60, total: 90 }, reason: "", checkedAt: extra.checkedAt || new Date().toISOString(), ...extra };
}

function stores(title: string, count: number, prefix: string) {
  return Array.from({ length: count }, (_, index) => offer(title, `${prefix} ${index}`, 120 + index, `https://${prefix}-${index}.example/${index}`));
}

describe("shopper last local review", () => {
  it("classifies quota, timeout and other failures separately", () => {
    expect(classifyShopperProviderFailure(new ShopperProviderError("quota", "HTTP 429")).kind).toBe("quota");
    expect(classifyShopperProviderFailure(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" })).kind).toBe("timeout");
    expect(classifyShopperProviderFailure(new Error("HTTP 503")).kind).toBe("unavailable");
    expect(classifyShopperProviderFailure(new Error("Invalid API key")).kind).toBe("error");
    expect(classifyShopperProviderFailure(new Error("Your account has run out of searches.")).kind).toBe("quota");
  });

  it("A. memória existente + serviço externo sem cota → memória continua aparecendo", async () => {
    const catalog = createShopperCatalogMemory(createInMemoryShopperCatalogStore());
    const query = interpretShopperIntent("kit shampoo condicionador wella invigo 1l", null);
    const remembered = offer("Kit Shampoo e Condicionador Wella Invigo 1L", "Loja A", 280, undefined, { checkedAt: "2026-09-10T12:00:00.000Z" });
    await catalog.remember("user-1", query, [remembered]);
    const provider = new SerpApiProductSearchProvider();
    const search = vi.spyOn(provider, "searchDetailed").mockRejectedValue(new ShopperProviderError("quota", "HTTP 429"));
    vi.spyOn(provider, "available").mockReturnValue(true);
    const result = await resolveShopperSearch("user-1", query, { catalog, provider });
    expect(search).toHaveBeenCalledOnce();
    expect(result.results).toHaveLength(1);
    expect(result.results[0].store).toBe("Loja A");
    expect(result.results[0].checkedAt).toBe("2026-09-10T12:00:00.000Z");
    expect(result.answer).not.toMatch(/serpapi|quota|429|\bapi\b/i);
  });

  it("B. refresh falha → resultados antigos permanecem", async () => {
    const catalog = createShopperCatalogMemory(createInMemoryShopperCatalogStore());
    const query = interpretShopperIntent("panela tramontina 24cm", null);
    await catalog.remember("user-1", query, [offer("Panela Tramontina 24cm", "Loja A", 120)]);
    const provider = new SerpApiProductSearchProvider();
    vi.spyOn(provider, "available").mockReturnValue(true);
    const discover = vi.fn(async () => { throw new ShopperProviderError("quota", "Your account has run out of searches."); });
    const result = await resolveShopperRefresh("user-1", query, { catalog, provider, discover });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].store).toBe("Loja A");
    expect(result.answer).toBe(shopperRefreshUnavailableUserMessage);
    expect(result.answer).not.toMatch(/serpapi|quota|429|\bapi\b/i);
    expect(result.shouldRemember).toBe(false);
    expect((await catalog.recall("user-1", query)).offers).toHaveLength(1);
  });

  it("C. produto novo + serviço externo indisponível → mensagem amigável e nenhum resultado inventado", async () => {
    const catalog = createShopperCatalogMemory(createInMemoryShopperCatalogStore());
    const query = interpretShopperIntent("air fryer 12 litros inox", null);
    const provider = new SerpApiProductSearchProvider();
    vi.spyOn(provider, "available").mockReturnValue(false);
    const result = await resolveShopperSearch("user-1", query, { catalog, provider });
    expect(result.results).toEqual([]);
    expect(result.variations).toEqual([]);
    expect(result.answer).toBe(shopperUnavailableUserMessage);
    expect(result.answer).not.toMatch(/serpapi|quota|429|\bapi\b/i);
    expect(result.failureKind).toBe("unavailable");
    expect(result.shouldRemember).toBe(false);
  });

  it("D. falha externa nunca apaga memória persistida", async () => {
    const catalog = createShopperCatalogMemory(createInMemoryShopperCatalogStore());
    const wella = interpretShopperIntent("kit shampoo condicionador wella invigo 1l", null);
    const notebook = interpretShopperIntent("notebook lenovo i5 16gb", null);
    await catalog.remember("user-1", wella, [offer("Kit Shampoo e Condicionador Wella Invigo 1L", "Loja A", 220)]);
    const provider = new SerpApiProductSearchProvider();
    vi.spyOn(provider, "available").mockReturnValue(true);
    const discover = vi.fn(async () => { throw new ShopperProviderError("timeout", "TimeoutError"); });
    const result = await resolveShopperSearch("user-1", notebook, { catalog, provider, discover });
    expect(result.results).toEqual([]);
    expect(result.shouldRemember).toBe(false);
    expect((await catalog.recall("user-1", wella)).used).toBe(true);
    expect((await catalog.recall("user-1", wella)).offers).toHaveLength(1);
  });

  it("E. 8ª chamada escolhe novo detail quando ele tiver maior valor esperado que paginação", async () => {
    const query = interpretShopperIntent("notebook lenovo 16gb", null);
    const provider = new SerpApiProductSearchProvider();
    const candidates = Array.from({ length: 8 }, (_, index) => ({
      productId: `p${index}`,
      token: `t${index}`,
      title: `Notebook Lenovo 16GB modelo ${index}`,
      relevance: 100 - index,
      sourceQuery: query.query,
      sourcePosition: index + 1,
      imageUrls: [] as string[],
      multipleSources: true,
    }));
    vi.spyOn(provider, "searchDetailed").mockResolvedValue({ results: [], detailCandidates: candidates, rawCount: 0 });
    vi.spyOn(provider, "searchGoogleResults").mockResolvedValue([]);
    const details = vi.spyOn(provider, "offersFor").mockImplementation(async (candidate, _query, page) => {
      if (page) return stores(candidate.title, 8, `Pagina ${candidate.productId}`);
      if (candidate.productId === "p0") {
        provider.nextStorePageTokens.set(candidate.token, "page-two");
        return stores(candidate.title, 8, "Rica");
      }
      provider.nextStorePageTokens.delete(candidate.token);
      return stores(candidate.title, 1, candidate.productId);
    });
    const result = await discoverProducts(query, provider);
    expect(result.metrics.searchCalls).toBe(1);
    expect(result.metrics.detailCalls).toBe(7);
    expect(result.metrics.storePageCalls).toBe(0);
    expect(details.mock.calls.filter(([, , page]) => page)).toHaveLength(0);
    expect(details.mock.calls.map(([candidate]) => candidate.productId)).toEqual(["p0", "p1", "p2", "p3", "p4", "p5", "p6"]);
    expect(result.metrics.searchCalls + result.metrics.detailCalls + result.metrics.storePageCalls).toBeLessThanOrEqual(8);
    expect(expectedCardGain(candidates[6], candidates.slice(0, 6))).toBeGreaterThan(expectedPageGain(8, true));
  });

  it("F. paginação ainda pode acontecer quando realmente for a opção de maior ganho", async () => {
    const query = interpretShopperIntent("panela tramontina 24cm", null);
    const provider = new SerpApiProductSearchProvider();
    const candidates = [
      { productId: "rich", token: "rich", title: query.query, relevance: 100, sourceQuery: query.query, sourcePosition: 1, imageUrls: [] as string[], multipleSources: true },
      { productId: "dup-1", token: "dup-1", title: query.query, relevance: 90, sourceQuery: query.query, sourcePosition: 2, imageUrls: [] as string[], multipleSources: false },
      { productId: "dup-2", token: "dup-2", title: query.query, relevance: 80, sourceQuery: query.query, sourcePosition: 3, imageUrls: [] as string[], multipleSources: false },
    ];
    vi.spyOn(provider, "searchDetailed").mockResolvedValue({ results: [], detailCandidates: candidates, rawCount: 0 });
    vi.spyOn(provider, "searchGoogleResults").mockResolvedValue([]);
    const details = vi.spyOn(provider, "offersFor").mockImplementation(async (candidate, _query, page) => {
      if (page) return stores(query.query, 6, "Pagina");
      if (candidate.productId === "rich") {
        provider.nextStorePageTokens.set(candidate.token, "page-two");
        return stores(query.query, 8, "Rica");
      }
      return stores(query.query, 1, candidate.productId);
    });
    const result = await discoverProducts(query, provider);
    expect(result.metrics.storePageCalls).toBe(1);
    expect(details.mock.calls[0][0].productId).toBe("rich");
    expect(details.mock.calls[1][2]).toBe("page-two");
    expect(expectedPageGain(8, true)).toBeGreaterThan(expectedCardGain(candidates[1], [candidates[0]]));
    expect(result.metrics.searchCalls + result.metrics.detailCalls + result.metrics.storePageCalls).toBeLessThanOrEqual(8);
  });

  it("G. orçamento total nunca ultrapassa 8 chamadas", async () => {
    const query = interpretShopperIntent("notebook lenovo 16gb", null);
    const provider = new SerpApiProductSearchProvider();
    const candidates = Array.from({ length: 20 }, (_, index) => ({
      productId: `p${index}`,
      token: `t${index}`,
      title: index < 2 ? `Notebook Lenovo 16GB modelo ${index}` : query.query,
      relevance: 100 - index,
      sourceQuery: query.query,
      sourcePosition: index + 1,
      imageUrls: [] as string[],
      multipleSources: index === 0,
    }));
    vi.spyOn(provider, "searchDetailed").mockResolvedValue({ results: [], detailCandidates: candidates, rawCount: 0 });
    vi.spyOn(provider, "searchGoogleResults").mockResolvedValue([]);
    const details = vi.spyOn(provider, "offersFor").mockImplementation(async (candidate, _query, page) => {
      if (!page) provider.nextStorePageTokens.set(candidate.token, `next-${candidate.token}`);
      return stores(candidate.title, 8, `${candidate.productId}-${page || "first"}`);
    });
    const result = await discoverProducts(query, provider);
    expect(result.metrics.searchCalls + result.metrics.detailCalls + result.metrics.storePageCalls).toBeLessThanOrEqual(shopperRuntime.budget.discovery.maxCalls);
    expect(result.metrics.searchCalls + result.metrics.detailCalls + result.metrics.storePageCalls).toBeLessThanOrEqual(8);
    expect(details.mock.calls.length + 1).toBeLessThanOrEqual(8);
  });

  it("does not reserve pagination when a new compatible card is available", () => {
    const nextCard = { productId: "new", token: "new", title: "Notebook Lenovo 16GB i7", relevance: 90, sourceQuery: "notebook", sourcePosition: 2, imageUrls: [] as string[], multipleSources: true };
    const opened = [{ productId: "old", token: "old", title: "Notebook Lenovo 16GB i5", relevance: 100, sourceQuery: "notebook", sourcePosition: 1, imageUrls: [] as string[], multipleSources: true }];
    const action = chooseNextDiscoveryAction({
      nextCard,
      opened,
      pageable: { candidate: opened[0], token: "page-two", addedStores: 8 },
      canDetail: true,
      canStorePage: true,
    });
    expect(action).toEqual({ kind: "detail", candidate: nextCard });
  });
});
