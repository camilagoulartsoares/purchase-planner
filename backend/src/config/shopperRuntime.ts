function envInt(name: string, fallback: number) {
  const raw = Number(process.env[name]);
  return Number.isInteger(raw) && raw > 0 ? raw : fallback;
}

const dayMs = 24 * 60 * 60 * 1000;

export type ShopperCallKind = "search" | "detail" | "storePage";

export type ShopperBudgetLimits = {
  maxCalls: number;
  maxSearch: number;
  maxDetail: number;
  maxStorePage: number;
  minDetailsBeforeStop: number;
  coverageStores: number;
  coverageOffers: number;
};

export const shopperRuntime = {
  memory: {
    identityTtlMs: envInt("SHOPPER_IDENTITY_TTL_MS", 21 * dayMs),
    queryMapTtlMs: envInt("SHOPPER_QUERY_MAP_TTL_MS", 10 * dayMs),
    priceTtlMs: envInt("SHOPPER_PRICE_TTL_MS", dayMs),
  },
  budget: {
    discovery: {
      maxCalls: envInt("SHOPPER_DISCOVERY_MAX_CALLS", 8),
      maxSearch: envInt("SHOPPER_DISCOVERY_MAX_SEARCH", 4),
      maxDetail: envInt("SHOPPER_DISCOVERY_MAX_DETAIL", 7),
      maxStorePage: envInt("SHOPPER_DISCOVERY_MAX_STORE_PAGES", 1),
      minDetailsBeforeStop: envInt("SHOPPER_DISCOVERY_MIN_DETAILS", 3),
      coverageStores: envInt("SHOPPER_COVERAGE_STORES", 6),
      coverageOffers: envInt("SHOPPER_COVERAGE_OFFERS", 4),
    } satisfies ShopperBudgetLimits,
    refresh: {
      maxCalls: envInt("SHOPPER_REFRESH_MAX_CALLS", 4),
      maxSearch: envInt("SHOPPER_REFRESH_MAX_SEARCH", 1),
      maxDetail: envInt("SHOPPER_REFRESH_MAX_DETAIL", 3),
      maxStorePage: envInt("SHOPPER_REFRESH_MAX_STORE_PAGES", 1),
      minDetailsBeforeStop: envInt("SHOPPER_REFRESH_MIN_DETAILS", 1),
      coverageStores: envInt("SHOPPER_COVERAGE_STORES", 6),
      coverageOffers: envInt("SHOPPER_COVERAGE_OFFERS", 4),
    } satisfies ShopperBudgetLimits,
  },
  map: {
    minCandidates: envInt("SHOPPER_MAP_MIN_CANDIDATES", 3),
    minCompatibleOffers: envInt("SHOPPER_MAP_MIN_OFFERS", 4),
  },
};

export function createShopperCallBudget(limits: ShopperBudgetLimits) {
  const spent = { search: 0, detail: 0, storePage: 0 };
  const total = () => spent.search + spent.detail + spent.storePage;
  const kindLimit = (kind: ShopperCallKind) => kind === "search" ? limits.maxSearch : kind === "detail" ? limits.maxDetail : limits.maxStorePage;
  return {
    limits,
    spent,
    total,
    remaining: () => Math.max(0, limits.maxCalls - total()),
    can(kind: ShopperCallKind) {
      return total() < limits.maxCalls && spent[kind] < kindLimit(kind);
    },
    consume(kind: ShopperCallKind) {
      if (!this.can(kind)) return false;
      spent[kind] += 1;
      return true;
    },
  };
}

export type ShopperCallBudget = ReturnType<typeof createShopperCallBudget>;

export function offerPriceStatus(checkedAt: string | undefined, now = Date.now()): "fresh" | "aged" {
  const checked = checkedAt ? Date.parse(checkedAt) : Number.NaN;
  if (!Number.isFinite(checked)) return "aged";
  return now - checked <= shopperRuntime.memory.priceTtlMs ? "fresh" : "aged";
}
