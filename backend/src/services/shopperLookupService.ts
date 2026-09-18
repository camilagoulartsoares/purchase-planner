import { createShopperCallBudget, shopperRuntime } from "../config/shopperRuntime.js";
import type { SearchedProduct, ShopperQuery } from "./productSearchProvider.js";
import { SerpApiProductSearchProvider, type ProductDetailCandidate } from "./serpApiProductSearchProvider.js";
import { createShopperCatalogMemory, type CatalogRecall } from "./shopperCatalogMemory.js";
import { discoverProducts, presentShopperOffers } from "./shopperDiscoveryService.js";
import { matchesRequiredIntent } from "./shopperIntentService.js";
import { logShopperProviderFailure, shopperRefreshUnavailableUserMessage, shopperUnavailableUserMessage, type ShopperFailureKind } from "./shopperProviderFailure.js";

export type ShopperLookupDeps = {
  catalog: ReturnType<typeof createShopperCatalogMemory>;
  discover?: typeof discoverProducts;
  provider: SerpApiProductSearchProvider;
};

export type ShopperLookupResult = {
  results: SearchedProduct[];
  variations: ReturnType<typeof presentShopperOffers>["variations"];
  answer: string;
  cacheHit: boolean;
  provider: string;
  shouldRemember: boolean;
  rememberOffers: SearchedProduct[];
  rememberCandidates: ProductDetailCandidate[];
  metrics: Record<string, unknown>;
  failureKind?: ShopperFailureKind;
};

function answerFor(query: ShopperQuery, results: SearchedProduct[]) {
  if (!results.length && query.maxPrice != null && query.maxPriceIsHard) return `Não encontrei opções que respeitem ${query.originalOnly ? "a exigência de original e " : ""}o teto de R$ ${query.maxPrice.toFixed(2).replace(".", ",")} nos resultados consultados.`;
  if (!results.length) return "Não encontrei produtos com dados suficientes nas lojas consultadas agora. Tente ajustar a descrição ou pesquisar novamente.";
  return `Encontrei ${results.length} opção${results.length > 1 ? "ões" : ""} real${results.length > 1 ? "is" : ""}. Organizei primeiro as que têm melhor aderência ao seu pedido.`;
}

function fromMemory(query: ShopperQuery, recalled: CatalogRecall, reason: string): ShopperLookupResult {
  const presented = presentShopperOffers(recalled.offers, query);
  const answer = presented.results.length
    ? `Encontrei ${presented.variations.length} variação${presented.variations.length === 1 ? "" : "ões"} e ${presented.results.length} oferta${presented.results.length === 1 ? "" : "s"}.`
    : answerFor(query, presented.results);
  return {
    results: presented.results,
    variations: presented.variations,
    answer,
    cacheHit: true,
    provider: "purchase-memory",
    shouldRemember: false,
    rememberOffers: [],
    rememberCandidates: [],
    metrics: { queries: [query.query], searchCalls: 0, detailCalls: 0, storePageCalls: 0, rawResults: recalled.offers.length, uniqueResults: presented.results.length, variationCount: presented.variations.length, offerCount: presented.results.length, stopReason: reason, memory: { used: true, reason: recalled.reason } },
  };
}

function unavailableEmpty(query: ShopperQuery, kind: ShopperFailureKind, refresh = false): ShopperLookupResult {
  return {
    results: [],
    variations: [],
    answer: refresh ? shopperRefreshUnavailableUserMessage : shopperUnavailableUserMessage,
    cacheHit: false,
    provider: "purchase-memory",
    shouldRemember: false,
    rememberOffers: [],
    rememberCandidates: [],
    metrics: { queries: [query.query], searchCalls: 0, detailCalls: 0, storePageCalls: 0, rawResults: 0, uniqueResults: 0, variationCount: 0, offerCount: 0, stopReason: `provider_${kind}`, memory: { used: false, reason: `provider_${kind}` } },
    failureKind: kind,
  };
}

function knownCandidatesFrom(recalled: CatalogRecall, query: ShopperQuery): ProductDetailCandidate[] {
  return recalled.products.flatMap((product) => product.detailToken ? [{ productId: product.googleProductId || product.identityKey, token: product.detailToken, title: product.title, relevance: 80, sourceQuery: query.query, sourcePosition: 1, imageUrls: product.imageUrl ? [product.imageUrl] : [], multipleSources: false }] : []);
}

export async function resolveShopperSearch(userId: string, query: ShopperQuery, deps: ShopperLookupDeps): Promise<ShopperLookupResult> {
  const recalled = await deps.catalog.recall(userId, query);
  if (recalled.used) return fromMemory(query, recalled, "memory");
  if (!deps.provider.available()) {
    logShopperProviderFailure("search.unavailable", new Error("provider_unavailable"), { userId, query: query.query });
    return unavailableEmpty(query, "unavailable");
  }
  try {
    const discovery = await (deps.discover || discoverProducts)(query, deps.provider);
    const results = discovery.results.filter((item) => matchesRequiredIntent(item, query));
    const answer = results.length
      ? `Encontrei ${discovery.variations.length} variação${discovery.variations.length === 1 ? "" : "ões"} e ${results.length} oferta${results.length === 1 ? "" : "s"} nas fontes consultadas.`
      : answerFor(query, results);
    return {
      results,
      variations: discovery.variations,
      answer,
      cacheHit: false,
      provider: deps.provider.id,
      shouldRemember: true,
      rememberOffers: discovery.catalogOffers || discovery.results,
      rememberCandidates: discovery.openedCandidates || [],
      metrics: discovery.metrics,
    };
  } catch (error) {
    const classified = logShopperProviderFailure("search", error, { userId, query: query.query });
    const latest = await deps.catalog.recall(userId, query);
    if (latest.used) return { ...fromMemory(query, latest, "memory_after_provider_failure"), failureKind: classified.kind };
    return unavailableEmpty(query, classified.kind);
  }
}

export async function resolveShopperRefresh(userId: string, query: ShopperQuery, deps: ShopperLookupDeps): Promise<ShopperLookupResult> {
  const recalled = await deps.catalog.recall(userId, query);
  const fallback = recalled.used ? fromMemory(query, recalled, "refresh_memory") : unavailableEmpty(query, "unavailable", true);
  if (recalled.used) fallback.answer = shopperRefreshUnavailableUserMessage;
  if (!deps.provider.available()) {
    logShopperProviderFailure("refresh.unavailable", new Error("provider_unavailable"), { userId, query: query.query });
    return { ...fallback, failureKind: "unavailable" };
  }
  try {
    const budget = createShopperCallBudget(shopperRuntime.budget.refresh);
    const knownCandidates = knownCandidatesFrom(recalled, query);
    const mapExpired = !recalled.mapExpiresAt || Date.parse(recalled.mapExpiresAt) <= Date.now();
    const skipSearch = Boolean(knownCandidates.length) && !mapExpired;
    const discovery = await (deps.discover || discoverProducts)(query, deps.provider, { budget, knownCandidates, skipSearch, mode: "refresh" });
    const combined = presentShopperOffers([...recalled.offers, ...discovery.results], query);
    const answer = combined.results.length
      ? `Atualizei ${combined.variations.length} variação${combined.variations.length === 1 ? "" : "ões"} e ${combined.results.length} oferta${combined.results.length === 1 ? "" : "s"}.`
      : answerFor(query, combined.results);
    return {
      results: combined.results,
      variations: combined.variations,
      answer,
      cacheHit: false,
      provider: deps.provider.id,
      shouldRemember: combined.results.length > 0,
      rememberOffers: combined.results,
      rememberCandidates: [...knownCandidates, ...(discovery.openedCandidates || [])],
      metrics: { ...discovery.metrics, searchCalls: budget.spent.search, detailCalls: budget.spent.detail, storePageCalls: budget.spent.storePage, stopReason: discovery.metrics.stopReason, memory: { used: recalled.used, reason: "refresh" } },
    };
  } catch (error) {
    const classified = logShopperProviderFailure("refresh", error, { userId, query: query.query });
    const latest = await deps.catalog.recall(userId, query);
    if (latest.used) return { ...fromMemory(query, latest, "refresh_after_provider_failure"), answer: shopperRefreshUnavailableUserMessage, failureKind: classified.kind };
    return { ...unavailableEmpty(query, classified.kind, true), failureKind: classified.kind };
  }
}
