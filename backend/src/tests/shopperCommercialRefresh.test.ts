import { describe, expect, it, vi } from "vitest";
import { shopperRuntime } from "../config/shopperRuntime.js";
import type { SearchedProduct } from "../services/productSearchProvider.js";
import { SerpApiProductSearchProvider } from "../services/serpApiProductSearchProvider.js";
import { createInMemoryShopperCatalogStore, createShopperCatalogMemory } from "../services/shopperCatalogMemory.js";
import { interpretShopperIntent } from "../services/shopperIntentService.js";
import { resolveShopperDiscovery, resolveShopperRefresh, resolveShopperSearch } from "../services/shopperLookupService.js";

function offer(id: string, store = "Loja A", price = 100): SearchedProduct {
  return { id, provider: "fixture", title: "Panela Tramontina 24cm", productTitle: "Panela Tramontina 24cm", price, previousPrice: null, currency: "BRL", store, brand: "Tramontina", imageUrl: null, productUrl: `https://${store.replace(/\s/g, "").toLowerCase()}.example/${id}`, rating: null, reviewCount: null, shipping: null, availability: "in_stock", discountPercent: null, match: { query: 100, budget: 100, style: 50, completeness: 80, total: 95 }, reason: "", checkedAt: new Date().toISOString() };
}
function discovery(results: SearchedProduct[]) {
  return { results, catalogOffers: results, variations: [], openedCandidates: [], metrics: { queries: ["panela tramontina 24cm"], searchCalls: 1, detailCalls: 0, storePageCalls: 0, rawResults: results.length, uniqueResults: results.length, variationCount: results.length, offerCount: results.length, stopReason: "coverage" } } as any;
}
function deps(memory: ReturnType<typeof createShopperCatalogMemory>, discover: any) {
  const provider = new SerpApiProductSearchProvider();
  vi.spyOn(provider, "available").mockReturnValue(true);
  return { catalog: memory, provider, discover };
}

describe("shopper commercial refresh policy", () => {
  const query = interpretShopperIntent("panela tramontina 24cm até 200 reais", null);

  it("uses memory before the two-hour full-discovery TTL", async () => {
    const memory = createShopperCatalogMemory(createInMemoryShopperCatalogStore());
    await memory.remember("u1", query, [offer("old")]);
    const discover = vi.fn();
    const result = await resolveShopperSearch("u1", query, deps(memory, discover));
    expect(result.memoryOnly).toBe(true);
    expect(discover).not.toHaveBeenCalled();
  });

  it("runs a new full discovery after the TTL and incorporates a new promotion", async () => {
    const oldNow = Date.now() - shopperRuntime.memory.fullDiscoveryTtlMs - 1;
    const memory = createShopperCatalogMemory(createInMemoryShopperCatalogStore(), () => oldNow);
    await memory.remember("u2", query, [offer("old")]);
    const discover = vi.fn().mockResolvedValue(discovery([offer("new", "Loja B", 90)]));
    const result = await resolveShopperSearch("u2", query, deps(memory, discover));
    expect(discover).toHaveBeenCalledOnce();
    expect(result.newOfferCount).toBe(1);
    expect(result.results.map((item) => item.id)).toEqual(expect.arrayContaining(["old", "new"]));
  });

  it("refreshes known prices without declaring a full discovery", async () => {
    const memory = createShopperCatalogMemory(createInMemoryShopperCatalogStore());
    await memory.remember("u3", query, [offer("old")]);
    const discover = vi.fn().mockResolvedValue(discovery([offer("old", "Loja A", 80)]));
    const result = await resolveShopperRefresh("u3", query, deps(memory, discover));
    expect(discover.mock.calls[0][2].mode).toBe("refresh");
    expect(result.rememberFullDiscovery).toBe(false);
    expect(result.fullDiscoveryAt).not.toBeNull();
  });

  it("forces full discovery after cooldown and merges without duplicate stores", async () => {
    const oldNow = Date.now() - shopperRuntime.memory.forcedDiscoveryCooldownMs - 1;
    const memory = createShopperCatalogMemory(createInMemoryShopperCatalogStore(), () => oldNow);
    await memory.remember("u4", query, [offer("old")]);
    const replacement = { ...offer("replacement", "Loja A", 80), productUrl: offer("old").productUrl };
    const discover = vi.fn().mockResolvedValue(discovery([replacement, offer("new", "Loja B", 90)]));
    const result = await resolveShopperDiscovery("u4", query, deps(memory, discover));
    expect(discover).toHaveBeenCalledOnce();
    expect(result.newOfferCount).toBe(1);
    expect(result.results.filter((item) => item.store === "Loja A")).toHaveLength(1);
  });

  it("keeps old results when the provider fails", async () => {
    const oldNow = Date.now() - shopperRuntime.memory.fullDiscoveryTtlMs - 1;
    const memory = createShopperCatalogMemory(createInMemoryShopperCatalogStore(), () => oldNow);
    await memory.remember("u5", query, [offer("old")]);
    const result = await resolveShopperSearch("u5", query, deps(memory, vi.fn().mockRejectedValue(new Error("provider failed"))));
    expect(result.results).toHaveLength(1);
    expect(result.answer).toContain("Mantive os resultados anteriores");
  });

  it("coalesces simultaneous equivalent discoveries into one provider execution", async () => {
    const memory = createShopperCatalogMemory(createInMemoryShopperCatalogStore());
    const discover = vi.fn().mockImplementation(async () => { await Promise.resolve(); return discovery([offer("new")]); });
    const shared = deps(memory, discover);
    const [first, second] = await Promise.all([resolveShopperSearch("u6", query, shared), resolveShopperSearch("u6", query, shared)]);
    expect(discover).toHaveBeenCalledOnce();
    expect(first.results).toEqual(second.results);
  });

  it("applies the forced cooldown but allows discovery after it expires", async () => {
    const store = createInMemoryShopperCatalogStore();
    let now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const memory = createShopperCatalogMemory(store, () => now);
    await memory.remember("u7", query, [offer("old")]);
    const discover = vi.fn().mockResolvedValue(discovery([offer("new", "Loja B")]));
    const shared = deps(memory, discover);
    expect((await resolveShopperDiscovery("u7", query, shared)).memoryOnly).toBe(true);
    expect(discover).not.toHaveBeenCalled();
    now += shopperRuntime.memory.forcedDiscoveryCooldownMs + 1;
    vi.setSystemTime(now);
    try { expect((await resolveShopperDiscovery("u7", query, shared)).memoryOnly).toBe(false); }
    finally { vi.useRealTimers(); }
    expect(discover).toHaveBeenCalledOnce();
  });
});
