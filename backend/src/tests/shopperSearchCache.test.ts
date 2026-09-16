import { describe, expect, it } from "vitest";
import { shopperSearchCache } from "../services/shopperSearchCache.js";
import type { ShopperQuery } from "../services/productSearchProvider.js";

const query = { query: "teste", category: null, maxPrice: null, maxPriceIsHard: false, currency: "BRL", colors: [], size: null, brands: [], usage: null, style: [], exclude: [], originalOnly: false, sortPreference: "best_match" } as ShopperQuery;
const result = { id: "offer-1" } as never;
describe("shopper in-memory cache", () => {
  it("reuses a result only in memory and resolves it for a valid action", () => { shopperSearchCache.clear(); shopperSearchCache.set("c1", query, [result]); expect(shopperSearchCache.get("c1", query)).toEqual([result]); expect(shopperSearchCache.result("c1", "offer-1")).toEqual(result); });
  it("limits entries with LRU eviction", () => { shopperSearchCache.clear(); for (let i = 0; i < 100; i++) shopperSearchCache.set(`c${i}`, { ...query, query: String(i) }, [result]); expect(shopperSearchCache.stats().size).toBeLessThanOrEqual(shopperSearchCache.stats().maxEntries); });
});
