import { createShopperCallBudget, shopperRuntime } from "../config/shopperRuntime.js";
import type { SearchedProduct, ShopperQuery } from "./productSearchProvider.js";
import { SerpApiProductSearchProvider, type ProductDetailCandidate } from "./serpApiProductSearchProvider.js";
import { createShopperCatalogMemory, offerMemoryKey, type CatalogRecall } from "./shopperCatalogMemory.js";
import { discoverProducts, presentShopperOffers } from "./shopperDiscoveryService.js";
import { matchesRequiredIntent, productIntentKey } from "./shopperIntentService.js";
import { logShopperProviderFailure, shopperRefreshUnavailableUserMessage, shopperUnavailableUserMessage, type ShopperFailureKind } from "./shopperProviderFailure.js";

export type ShopperLookupDeps = { catalog: ReturnType<typeof createShopperCatalogMemory>; discover?: typeof discoverProducts; provider: SerpApiProductSearchProvider };
export type ShopperLookupResult = {
  results: SearchedProduct[]; variations: ReturnType<typeof presentShopperOffers>["variations"]; answer: string; cacheHit: boolean; provider: string;
  shouldRemember: boolean; rememberOffers: SearchedProduct[]; rememberCandidates: ProductDetailCandidate[]; metrics: Record<string, any>; failureKind?: ShopperFailureKind;
  memoryOnly: boolean; pricesCheckedAt: string | null; fullDiscoveryAt: string | null; newOfferCount: number; rememberFullDiscovery: boolean; previousDiscoveryAt: string | null;
};

const inFlight = new Map<string, Promise<ShopperLookupResult>>();
function coalesce(key: string, task: () => Promise<ShopperLookupResult>) {
  const current = inFlight.get(key);
  if (current) return current;
  const promise = task().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}
function answerFor(query: ShopperQuery, results: SearchedProduct[]) {
  if (!results.length && query.maxPrice != null && query.maxPriceIsHard) return `Não encontrei opções que respeitem ${query.originalOnly ? "a exigência de original e " : ""}o teto de R$ ${query.maxPrice.toFixed(2).replace(".", ",")} nos resultados consultados.`;
  if (!results.length) return "Não encontrei produtos com dados suficientes nas lojas consultadas agora. Tente ajustar a descrição ou pesquisar novamente.";
  return `Encontrei ${results.length} opção${results.length > 1 ? "ões" : ""} real${results.length > 1 ? "is" : ""}.`;
}
function latestCheck(recalled: CatalogRecall, results: SearchedProduct[]) {
  return results.map((item) => item.checkedAt).filter((item): item is string => Boolean(item)).sort().at(-1) || recalled.newestPriceCheckedAt;
}
function mergeRecalledOffers(recalled: CatalogRecall, fresh: SearchedProduct[], query: ShopperQuery) {
  const refreshedKeys = new Set(fresh.map(offerMemoryKey));
  return presentShopperOffers([...recalled.offers.filter((item) => !refreshedKeys.has(offerMemoryKey(item))), ...fresh], query);
}
function fromMemory(query: ShopperQuery, recalled: CatalogRecall, reason: string): ShopperLookupResult {
  const presented = presentShopperOffers(recalled.offers, query);
  return {
    results: presented.results, variations: presented.variations,
    answer: presented.results.length ? `Carreguei da memória ${presented.variations.length} variação${presented.variations.length === 1 ? "" : "ões"} e ${presented.results.length} oferta${presented.results.length === 1 ? "" : "s"}.` : answerFor(query, presented.results),
    cacheHit: true, provider: "purchase-memory", shouldRemember: false, rememberOffers: [], rememberCandidates: [],
    metrics: { queries: [query.query], searchCalls: 0, detailCalls: 0, storePageCalls: 0, rawResults: recalled.offers.length, uniqueResults: presented.results.length, variationCount: presented.variations.length, offerCount: presented.results.length, stopReason: reason, memory: { used: true, reason: recalled.reason } },
    memoryOnly: true, pricesCheckedAt: recalled.newestPriceCheckedAt, fullDiscoveryAt: recalled.discoveredAt, newOfferCount: 0, rememberFullDiscovery: false, previousDiscoveryAt: recalled.discoveredAt,
  };
}
function unavailableEmpty(query: ShopperQuery, kind: ShopperFailureKind, refresh = false): ShopperLookupResult {
  return {
    results: [], variations: [], answer: refresh ? shopperRefreshUnavailableUserMessage : shopperUnavailableUserMessage, cacheHit: false, provider: "purchase-memory", shouldRemember: false, rememberOffers: [], rememberCandidates: [],
    metrics: { queries: [query.query], searchCalls: 0, detailCalls: 0, storePageCalls: 0, rawResults: 0, uniqueResults: 0, variationCount: 0, offerCount: 0, stopReason: `provider_${kind}`, memory: { used: false, reason: `provider_${kind}` } },
    failureKind: kind, memoryOnly: false, pricesCheckedAt: null, fullDiscoveryAt: null, newOfferCount: 0, rememberFullDiscovery: false, previousDiscoveryAt: null,
  };
}
function knownCandidatesFrom(recalled: CatalogRecall, query: ShopperQuery): ProductDetailCandidate[] {
  return recalled.products.flatMap((product) => product.detailToken ? [{ productId: product.googleProductId || product.identityKey, token: product.detailToken, title: product.title, relevance: 80, sourceQuery: query.query, sourcePosition: 1, imageUrls: product.imageUrl ? [product.imageUrl] : [], multipleSources: false }] : []);
}
async function runFullDiscovery(userId: string, query: ShopperQuery, deps: ShopperLookupDeps, recalled: CatalogRecall, forced: boolean): Promise<ShopperLookupResult> {
  if (!deps.provider.available()) {
    logShopperProviderFailure("search.unavailable", new Error("provider_unavailable"), { userId, query: query.query });
    if (recalled.used) return { ...fromMemory(query, recalled, "memory_after_provider_failure"), answer: "Mantive os resultados anteriores, mas não foi possível verificar novas promoções agora.", failureKind: "unavailable" };
    return unavailableEmpty(query, "unavailable");
  }
  try {
    const discovery = await (deps.discover || discoverProducts)(query, deps.provider);
    const validNew = (discovery.catalogOffers || discovery.results).filter((item) => matchesRequiredIntent(item, query));
    const oldKeys = new Set(recalled.offers.map(offerMemoryKey));
    const newOfferCount = validNew.filter((item) => !oldKeys.has(offerMemoryKey(item))).length;
    const combined = mergeRecalledOffers(recalled, validNew, query);
    const answer = forced
      ? `Busca completa concluída. ${newOfferCount ? `Encontrei ${newOfferCount} nova${newOfferCount === 1 ? "" : "s"} oferta${newOfferCount === 1 ? "" : "s"}.` : "Não encontrei ofertas novas desta vez."}`
      : combined.results.length ? `Atualizei a busca e encontrei ${newOfferCount} nova${newOfferCount === 1 ? "" : "s"} oferta${newOfferCount === 1 ? "" : "s"}.` : answerFor(query, combined.results);
    return {
      results: combined.results, variations: combined.variations, answer, cacheHit: false, provider: deps.provider.id, shouldRemember: combined.results.length > 0,
      rememberOffers: combined.results, rememberCandidates: discovery.openedCandidates || [], metrics: { ...discovery.metrics, memory: { used: recalled.used, reason: forced ? "forced_full_discovery" : "scheduled_full_discovery" } },
      memoryOnly: false, pricesCheckedAt: latestCheck(recalled, validNew) || new Date().toISOString(), fullDiscoveryAt: new Date().toISOString(), newOfferCount, rememberFullDiscovery: true, previousDiscoveryAt: recalled.discoveredAt,
    };
  } catch (error) {
    const classified = logShopperProviderFailure(forced ? "discovery.force" : "search", error, { userId, query: query.query });
    const latest = await deps.catalog.recall(userId, query);
    if (latest.used) return { ...fromMemory(query, latest, "memory_after_provider_failure"), answer: "Mantive os resultados anteriores, mas não foi possível verificar novas promoções agora.", failureKind: classified.kind };
    return unavailableEmpty(query, classified.kind);
  }
}
export async function resolveShopperSearch(userId: string, query: ShopperQuery, deps: ShopperLookupDeps): Promise<ShopperLookupResult> {
  const recalled = await deps.catalog.recall(userId, query);
  const discovered = recalled.discoveredAt ? Date.parse(recalled.discoveredAt) : Number.NaN;
  const oldestPrice = recalled.oldestPriceCheckedAt ? Date.parse(recalled.oldestPriceCheckedAt) : Number.NaN;
  if (recalled.used && Number.isFinite(discovered) && Date.now() - discovered < shopperRuntime.memory.fullDiscoveryTtlMs) {
    if (Number.isFinite(oldestPrice) && Date.now() - oldestPrice > shopperRuntime.memory.priceTtlMs) return resolveShopperRefresh(userId, query, deps);
    return fromMemory(query, recalled, "memory_within_full_discovery_ttl");
  }
  return coalesce(`${userId}:${productIntentKey(query)}:full`, () => runFullDiscovery(userId, query, deps, recalled, false));
}
export async function resolveShopperDiscovery(userId: string, query: ShopperQuery, deps: ShopperLookupDeps): Promise<ShopperLookupResult> {
  const recalled = await deps.catalog.recall(userId, query);
  const discovered = recalled.discoveredAt ? Date.parse(recalled.discoveredAt) : Number.NaN;
  if (recalled.used && Number.isFinite(discovered) && Date.now() - discovered < shopperRuntime.memory.forcedDiscoveryCooldownMs) {
    const result = fromMemory(query, recalled, "forced_discovery_cooldown");
    result.answer = "A busca completa foi feita há pouco. Mantive os resultados atuais para evitar chamadas repetidas; tente novamente após o intervalo de segurança.";
    return result;
  }
  return coalesce(`${userId}:${productIntentKey(query)}:full`, () => runFullDiscovery(userId, query, deps, recalled, true));
}
export async function resolveShopperRefresh(userId: string, query: ShopperQuery, deps: ShopperLookupDeps): Promise<ShopperLookupResult> {
  const recalled = await deps.catalog.recall(userId, query);
  const fallback = recalled.used ? fromMemory(query, recalled, "refresh_memory") : unavailableEmpty(query, "unavailable", true);
  if (recalled.used) fallback.answer = shopperRefreshUnavailableUserMessage;
  if (!deps.provider.available()) {
    logShopperProviderFailure("refresh.unavailable", new Error("provider_unavailable"), { userId, query: query.query });
    return { ...fallback, failureKind: "unavailable" };
  }
  return coalesce(`${userId}:${productIntentKey(query)}:refresh`, async () => {
    try {
      const budget = createShopperCallBudget(shopperRuntime.budget.refresh);
      const knownCandidates = knownCandidatesFrom(recalled, query);
      const mapExpired = !recalled.mapExpiresAt || Date.parse(recalled.mapExpiresAt) <= Date.now();
      const discovery = await (deps.discover || discoverProducts)(query, deps.provider, { budget, knownCandidates, skipSearch: Boolean(knownCandidates.length) && !mapExpired, mode: "refresh" });
      const combined = mergeRecalledOffers(recalled, discovery.results, query);
      return {
        results: combined.results, variations: combined.variations, answer: combined.results.length ? `Atualizei os preços de ${combined.results.length} oferta${combined.results.length === 1 ? "" : "s"} conhecida${combined.results.length === 1 ? "" : "s"}.` : answerFor(query, combined.results),
        cacheHit: false, provider: deps.provider.id, shouldRemember: combined.results.length > 0, rememberOffers: combined.results, rememberCandidates: [...knownCandidates, ...(discovery.openedCandidates || [])],
        metrics: { ...discovery.metrics, searchCalls: budget.spent.search, detailCalls: budget.spent.detail, storePageCalls: budget.spent.storePage, memory: { used: recalled.used, reason: "refresh" } },
        memoryOnly: false, pricesCheckedAt: latestCheck(recalled, discovery.results), fullDiscoveryAt: recalled.discoveredAt, newOfferCount: 0, rememberFullDiscovery: false, previousDiscoveryAt: recalled.discoveredAt,
      } satisfies ShopperLookupResult;
    } catch (error) {
      const classified = logShopperProviderFailure("refresh", error, { userId, query: query.query });
      const latest = await deps.catalog.recall(userId, query);
      if (latest.used) return { ...fromMemory(query, latest, "refresh_after_provider_failure"), answer: shopperRefreshUnavailableUserMessage, failureKind: classified.kind };
      return { ...unavailableEmpty(query, classified.kind, true), failureKind: classified.kind };
    }
  });
}
