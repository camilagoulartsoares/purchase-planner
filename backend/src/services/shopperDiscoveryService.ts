import { createShopperCallBudget, offerPriceStatus, shopperRuntime, type ShopperCallBudget } from "../config/shopperRuntime.js";
import { SerpApiProductSearchProvider, type ProductDetailCandidate } from "./serpApiProductSearchProvider.js";
import { preserveBetterOfferReview, type SearchedProduct, type ShopperQuery, type ShopperVariation } from "./productSearchProvider.js";
import { isExplicitlyUnavailable } from "./shopperAvailabilityService.js";
import { evaluateOfferMatch, evaluateProductMatch, matchesQueryAttributes, matchesRequiredIntent, normalizeShopperText, shopperTokens, tokenMatches } from "./shopperIntentService.js";
import { ShopperProviderError, shopperProviderErrorFromUnknown } from "./shopperProviderFailure.js";

const searchConcurrency = 2;
const shoppingWaitAfterGoogleMs = 8_000;
const shoppingWaitWithoutGoogleMs = 25_000;

function candidateSimilarity(a: ProductDetailCandidate, b: ProductDetailCandidate) {
  const left = new Set(shopperTokens(a.title));
  const right = new Set(shopperTokens(b.title));
  const union = new Set([...left, ...right]);
  return union.size ? [...left].filter((token) => right.has(token)).length / union.size : 0;
}

// Cards are leads, not verified offers. Their price only breaks ties; it never
// excludes a product whose details might contain a cheaper store.
export function selectDetailCandidates(candidates: ProductDetailCandidate[], query: ShopperQuery, limit: number, alreadySelected: ProductDetailCandidate[] = []) {
  const selected = [...alreadySelected];
  const remaining = [...new Map(candidates.filter((item) => !selected.some((chosen) => chosen.productId === item.productId))
    .map((item) => [item.productId, item] as const)).values()];
  const priority = (item: ProductDetailCandidate) => {
    const match = evaluateProductMatch(item.title, query);
    const explicitConflict = ["quantity_conflict", "size_conflict", "color_conflict", "gender_conflict", "brand_similarity_conflict"].includes(match.reason || "");
    const price = item.indicativePrice;
    const budget = query.maxPrice == null || price == null ? 1 : price <= query.maxPrice ? 2 : 0;
    const similar = selected.filter((chosen) => candidateSimilarity(item, chosen) >= .85);
    const sameStore = similar.filter((chosen) => item.indicativeStore && chosen.indicativeStore && normalize(item.indicativeStore) === normalize(chosen.indicativeStore)).length;
    return { conflict: explicitConflict ? 0 : 1, confidence: match.confidence, composition: match.reason === "composition_missing" ? 0 : 1, sources: item.multipleSources ? 1 : 0, budget, novelty: -(similar.length + sameStore), relevance: item.relevance };
  };
  while (remaining.length && selected.length - alreadySelected.length < limit) {
    remaining.sort((a, b) => {
      const x = priority(a), y = priority(b);
      return y.conflict - x.conflict || y.confidence - x.confidence || y.composition - x.composition || y.sources - x.sources || y.novelty - x.novelty || y.budget - x.budget || y.relevance - x.relevance || a.sourcePosition - b.sourcePosition;
    });
    selected.push(remaining.shift()!);
  }
  return selected.slice(alreadySelected.length);
}

function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim(); }

export function expandQueries(query: ShopperQuery) {
  const base = query.query.trim();
  const normalizedUnits = normalizeShopperText(base);
  const terms = shopperTokens(base).join(" ");
  const meaningful = terms.split(" ").filter((term) => !["tamanho", "capacidade", "peso", "cor"].includes(term));
  const withoutAttributeLabels = meaningful.join(" ");
  const broad = meaningful.flatMap((term, index) => index > 0 && !/\d/.test(term) ? [meaningful.filter((_, position) => position !== index).join(" ")] : []);
  return [...new Set([base, normalizedUnits, withoutAttributeLabels, ...broad, terms].filter(Boolean))];
}

function normalizedUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|gclid|fbclid)/i.test(key)) url.searchParams.delete(key);
    if (url.hostname === "www.google.com" && url.searchParams.get("ibp") === "oshop" && url.searchParams.has("prds")) url.searchParams.delete("q");
    return url.toString();
  } catch { return value; }
}

function offerKey(item: SearchedProduct) {
  return `url:${normalizedUrl(item.productUrl)}:${normalize(item.store || "")}:${item.price ?? ""}`;
}

export function groupVariations(results: SearchedProduct[]): ShopperVariation[] {
  const groups: Array<{ variation: ShopperVariation; tokens: string[]; quantities: string; productId: string | null }> = [];
  for (const offer of results) {
    const productIdentity = offer.productTitle || offer.title;
    const tokens = shopperTokens(productIdentity).filter((token) => !["kit", "profissional", "profissionais", "professional", "professionals", "produto", "produtos"].includes(token));
    const quantities = tokens.filter((token) => /^\d+(?:ml|g|gb|tb|mm|cm)$/.test(token)).sort().join("|");
    const group = groups.find((entry) => {
      if (entry.productId && offer.productId && entry.productId !== offer.productId) return false;
      if (entry.quantities !== quantities) return false;
      const union = new Set([...entry.tokens, ...tokens]);
      const shared = entry.tokens.filter((token) => tokens.includes(token)).length;
      return shared / Math.max(1, union.size) >= .85;
    });
    const target = group || { variation: { id: `${offer.productId || offer.id}:${tokens.slice().sort().join("-")}`, title: productIdentity, imageUrl: offer.imageUrl, imageSource: offer.imageSource || null, offers: [] }, tokens, quantities, productId: offer.productId || null };
    if (!group) groups.push(target);
    if (!target.variation.offers.some((old) => offerKey(old) === offerKey(offer))) target.variation.offers.push(offer);
    if (!target.variation.imageUrl && offer.imageUrl) { target.variation.imageUrl = offer.imageUrl; target.variation.imageSource = offer.imageSource || null; }
  }
  return groups.map(({ variation: group }) => {
    const offers = group.offers.sort((a, b) => b.match.total - a.match.total || (a.price ?? Infinity) - (b.price ?? Infinity));
    const imageOffer = offers.find((offer) => offer.imageUrl);
    return { ...group, imageUrl: imageOffer?.imageUrl || group.imageUrl, imageSource: imageOffer?.imageSource || group.imageSource, offers };
  }).sort((a, b) => ((b.offers[0]?.match.total || 0) + Math.min(b.offers.length - 1, 4) * 5) - ((a.offers[0]?.match.total || 0) + Math.min(a.offers.length - 1, 4) * 5));
}

function rankProducts(results: SearchedProduct[], query: ShopperQuery) {
  const requested = shopperTokens(query.query).filter((term) => !["tamanho", "capacidade", "peso", "cor"].includes(term));
  const corpus = results.map((item) => shopperTokens([item.title, item.productTitle, item.attributesText].filter(Boolean).join(" ")));
  const weights = requested.map((term) => {
    const frequency = corpus.filter((tokens) => tokens.some((candidate) => tokenMatches(term, candidate))).length;
    const rarity = 1 + Math.log((results.length + 1) / (frequency + 1));
    return rarity * (/\d/.test(term) ? 1.5 : 1);
  });
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  return results.map((item, index) => {
    const coverage = requested.reduce((sum, term, position) => sum + (corpus[index].some((candidate) => tokenMatches(term, candidate)) ? weights[position] : 0), 0) / totalWeight;
    const exactSource = normalizeShopperText(item.sourceQuery || "") === normalizeShopperText(query.query);
    const completeness = [item.price, item.imageUrl, item.store, item.productUrl].filter((value) => value != null).length * 25;
    const budget = query.maxPrice == null || item.price == null ? 50 : item.price <= query.maxPrice ? 100 : 0;
    const total = Math.min(100, Math.round(coverage * 78 + (exactSource ? 8 : 0) + completeness * .1 + budget * .04 + (item.price != null ? 8 : -8)));
    return { ...item, match: { query: Math.round(coverage * 100), budget, style: 50, completeness, total } };
  }).sort((a, b) => b.match.total - a.match.total || (a.price ?? Infinity) - (b.price ?? Infinity));
}

async function limited<T, R>(items: T[], concurrency: number, work: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const output: PromiseSettledResult<R>[] = Array(items.length);
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) { const current = index++; try { output[current] = { status: "fulfilled", value: await work(items[current]) }; } catch (reason) { output[current] = { status: "rejected", reason }; } }
  }));
  return output;
}

export type ShopperDiagnostics = Array<Record<string, unknown>>;

export function presentShopperOffers(items: SearchedProduct[], query: ShopperQuery, diagnostics: ShopperDiagnostics = [], now = Date.now()) {
  const identityOffers = items.filter((item) => {
    if (isExplicitlyUnavailable(item.availability)) {
      diagnostics.push({ stage: "offer", title: item.title, price: item.price, store: item.store, productId: item.productId, offerMatch: "FAIL", reason: "out_of_stock" });
      return false;
    }
    const evaluation = evaluateOfferMatch(item, query);
    if (evaluation.eligible) return true;
    diagnostics.push({ stage: "offer", title: item.title, price: item.price, store: item.store, productId: item.productId, offerMatch: "FAIL", reason: evaluation.reason || "identity_mismatch" });
    return false;
  });
  const compatibleOffers = identityOffers.filter((item) => {
    if (matchesRequiredIntent(item, query)) return true;
    diagnostics.push({ stage: "offer", title: item.title, price: item.price, store: item.store, productId: item.productId, offerMatch: "FAIL", reason: "price_out_of_range" });
    return false;
  });
  const byUrl = new Map<string, SearchedProduct>();
  const identityByKey = new Map<string, SearchedProduct>();
  for (const item of identityOffers) {
    const key = offerKey(item);
    const existing = identityByKey.get(key);
    if (!existing) identityByKey.set(key, item);
    else preserveBetterOfferReview(existing, item);
  }
  for (const item of compatibleOffers) {
    const key = offerKey(item);
    const existing = byUrl.get(key);
    if (!existing) byUrl.set(key, item);
    else { preserveBetterOfferReview(existing, item); diagnostics.push({ stage: "deduplication", title: item.title, productId: item.productId, store: item.store, price: item.price, deduplicated: true, discardedId: item.id, discardedUrl: item.productUrl, survivorId: existing.id, survivorUrl: existing.productUrl, dedupKey: key, reason: "same_offer_identity" }); }
  }
  const eligible = [...byUrl.values()];
  const pricedEligible = eligible.filter((item) => item.price != null);
  if (pricedEligible.length) for (const item of eligible) if (item.price == null) diagnostics.push({ stage: "offer", title: item.title, store: item.store, productId: item.productId, id: item.id, url: item.productUrl, offerMatch: "FAIL", reason: "unpriced_when_priced_available" });
  const ranked = rankProducts(pricedEligible.length ? pricedEligible : eligible, query).map((item) => ({ ...item, priceStatus: offerPriceStatus(item.checkedAt, now) }));
  const results = ranked.filter((item) => {
    const fit = matchesQueryAttributes([item.title, item.productTitle, item.attributesText].filter(Boolean).join(" "), query);
    if (fit.eligible) return true;
    diagnostics.push({ stage: "ranking", title: item.title, score: item.match.query, coverage: fit.coverage, reason: "low_relevance" });
    return false;
  });
  const variations = groupVariations(results);
  return { results: variations.flatMap((variation) => variation.offers), variations, eligible, compatibleOffers, identityOffers: [...identityByKey.values()], uniqueKeys: byUrl.size };
}

function compatibleCount(items: SearchedProduct[], query: ShopperQuery) {
  return items.filter((item) => item.price != null && matchesRequiredIntent(item, query) && evaluateProductMatch([item.title, item.productTitle, item.attributesText].filter(Boolean).join(" "), query).confidence >= 70).length;
}

function uniqueStores(items: SearchedProduct[]) {
  return new Set(items.map((item) => normalize(item.store || "")).filter(Boolean));
}

export type DiscoveryPageCandidate = {
  candidate: ProductDetailCandidate;
  token: string;
  addedStores: number;
};

export function expectedCardGain(card: ProductDetailCandidate | undefined, opened: ProductDetailCandidate[]) {
  if (!card) return 0;
  const similar = opened.some((chosen) => candidateSimilarity(card, chosen) >= .85);
  if (card.multipleSources && !similar) return 12;
  if (!similar) return 10;
  if (card.multipleSources) return 6;
  return 3;
}

export function expectedPageGain(addedStores: number, hasToken: boolean) {
  if (!hasToken) return 0;
  if (addedStores >= 8) return 9;
  if (addedStores >= 5) return 7;
  if (addedStores >= 4) return 5;
  return 2;
}

export function chooseNextDiscoveryAction(input: {
  nextCard?: ProductDetailCandidate;
  opened: ProductDetailCandidate[];
  pageable?: DiscoveryPageCandidate | null;
  canDetail: boolean;
  canStorePage: boolean;
}): { kind: "detail"; candidate: ProductDetailCandidate } | { kind: "storePage"; candidate: ProductDetailCandidate; token: string } | null {
  const cardGain = input.canDetail ? expectedCardGain(input.nextCard, input.opened) : 0;
  const pageGain = input.canStorePage && input.pageable ? expectedPageGain(input.pageable.addedStores, true) : 0;
  if (input.pageable && input.canStorePage && pageGain > cardGain) return { kind: "storePage", candidate: input.pageable.candidate, token: input.pageable.token };
  if (input.nextCard && input.canDetail) return { kind: "detail", candidate: input.nextCard };
  if (input.pageable && input.canStorePage && pageGain > 0) return { kind: "storePage", candidate: input.pageable.candidate, token: input.pageable.token };
  return null;
}

function coverageReached(offers: SearchedProduct[], query: ShopperQuery, limits = shopperRuntime.budget.discovery) {
  const compatible = offers.filter((item) => matchesRequiredIntent(item, query));
  return uniqueStores(compatible).size >= limits.coverageStores && compatible.length >= limits.coverageOffers;
}

export type DiscoveryOptions = {
  budget?: ShopperCallBudget;
  knownCandidates?: ProductDetailCandidate[];
  mode?: "discovery" | "refresh";
  skipSearch?: boolean;
};

export async function discoverProducts(query: ShopperQuery, provider = new SerpApiProductSearchProvider(), options: DiscoveryOptions = {}) {
  const startedAt = Date.now();
  const milestones: Record<string, number> = {};
  const mark = (stage: string) => { milestones[stage] = Date.now() - startedAt; };
  const limits = options.mode === "refresh" ? shopperRuntime.budget.refresh : shopperRuntime.budget.discovery;
  const budget = options.budget || createShopperCallBudget(limits);
  const diagnostics: ShopperDiagnostics = [];
  const phrases = expandQueries(query);
  const successful: Array<{ results: SearchedProduct[]; detailCandidates: ProductDetailCandidate[]; rawCount: number; engine?: string }> = [];
  const raw: SearchedProduct[] = [];
  const allDetailCandidates: ProductDetailCandidate[] = [...new Map([...(options.knownCandidates || []), ...provider.googleDetailCandidates].map((item) => [item.productId, item] as const)).values()];
  const fallbackPhrases: string[] = [];
  const exactSourceLifecycle: Array<Record<string, unknown>> = [];
  let stopReason = "budget";
  let googleRan = false;
  let lastSearchFailure: unknown = null;

  const absorb = (entry: { results: SearchedProduct[]; detailCandidates: ProductDetailCandidate[]; rawCount: number } | null | undefined, stage: string, engine: string) => {
    if (!entry) return;
    successful.push({ ...entry, engine });
    raw.push(...entry.results);
    for (const item of entry.detailCandidates) if (!allDetailCandidates.some((candidate) => candidate.productId === item.productId)) allDetailCandidates.push(item);
    for (const item of entry.results) {
      const evaluation = evaluateProductMatch([item.title, item.productTitle, item.attributesText].filter(Boolean).join(" "), query);
      diagnostics.push({ stage: "search", sourceQuery: item.sourceQuery, position: item.sourcePosition, title: item.title, price: item.price, store: item.store, productId: item.productId, imageUrl: item.imageUrl, preFilter: evaluation.eligible ? "PASS" : "DEFERRED_TO_DETAILS", reason: evaluation.reason, normalized: evaluation.normalized, engine });
    }
    exactSourceLifecycle.push({ engine, incorporatedAt: stage, started: true, failed: false });
  };

  const searchShopping = async (phrase: string, engine: "google_shopping" | "google_shopping_light") => {
    if (!budget.consume("search")) return null;
    try {
      return await provider.searchDetailed(query, phrase, engine);
    } catch (error) {
      lastSearchFailure = error;
      exactSourceLifecycle.push({ engine, incorporatedAt: null, started: true, failed: true, phrase });
      return null;
    }
  };

  const shopping = options.skipSearch ? null : await searchShopping(query.query, "google_shopping");
  absorb(shopping, "shopping_map", "google_shopping");
  mark("shopping");

  const mapReady = () => allDetailCandidates.length > 0 || compatibleCount(raw, query) > 0;

  if (!options.skipSearch && !mapReady() && budget.can("search")) {
    const light = await searchShopping(query.query, "google_shopping_light");
    absorb(light, "light_recovery", "google_shopping_light");
  }
  mark("light");

  if (!options.skipSearch && !mapReady() && budget.can("search")) {
    const extras = phrases.filter((phrase) => phrase !== query.query).slice(0, 1);
    const searched = await limited(extras, searchConcurrency, async (phrase) => {
      if (!budget.can("search") || mapReady()) return null;
      fallbackPhrases.push(phrase);
      return searchShopping(phrase, "google_shopping_light");
    });
    for (const entry of searched) if (entry.status === "fulfilled" && entry.value) absorb(entry.value, "fallback", "google_shopping_light");
  }
  mark("fallback");

  if (!options.skipSearch && !mapReady() && budget.can("search")) {
    budget.consume("search");
    googleRan = true;
    const googleResults = await provider.searchGoogleResults(query).catch((error) => {
      lastSearchFailure = error;
      return [] as SearchedProduct[];
    });
    for (const item of provider.googleDetailCandidates) if (!allDetailCandidates.some((candidate) => candidate.productId === item.productId)) allDetailCandidates.push(item);
    absorb({ results: googleResults, detailCandidates: [], rawCount: googleResults.length }, "google_recovery", "google");
  }
  mark("google");

  if (!successful.length && !raw.length && !allDetailCandidates.length && !options.skipSearch) {
    throw lastSearchFailure ? shopperProviderErrorFromUnknown(lastSearchFailure) : new ShopperProviderError("unavailable", "Nenhuma consulta ao shopping pôde ser concluída.");
  }

  const opened: ProductDetailCandidate[] = [];
  const detailOffers: SearchedProduct[] = [];
  const knownKeys = new Set<string>();
  const knownStoreSet = uniqueStores(raw);
  let lastNewStores = Number.POSITIVE_INFINITY;
  const failedDetails: ProductDetailCandidate[] = [];
  let storePageCalls = 0;
  let failedStorePages = 0;
  const pageYield = new Map<string, number>();
  const pagedTokens = new Set<string>();

  const bestPageable = (): DiscoveryPageCandidate | null => {
    let best: DiscoveryPageCandidate | null = null;
    for (const candidate of opened) {
      if (pagedTokens.has(candidate.token)) continue;
      const token = provider.nextStorePageTokens.get(candidate.token);
      if (!token) continue;
      const addedStores = pageYield.get(candidate.token) ?? 0;
      if (!best || addedStores > best.addedStores) best = { candidate, token, addedStores };
    }
    return best;
  };

  while (budget.can("detail") || budget.can("storePage")) {
    const nextCard = selectDetailCandidates(allDetailCandidates, query, 1, opened)[0];
    const coverageStop = opened.length >= limits.minDetailsBeforeStop && coverageReached([...raw, ...detailOffers], query, limits) && lastNewStores <= 1 && !nextCard?.multipleSources;
    const action = chooseNextDiscoveryAction({
      nextCard: coverageStop ? undefined : nextCard,
      opened,
      pageable: bestPageable(),
      canDetail: Boolean(nextCard) && !coverageStop && budget.can("detail"),
      canStorePage: budget.can("storePage"),
    });
    if (!action) {
      stopReason = coverageStop ? "low_marginal_gain" : nextCard ? "budget" : "no_candidates";
      break;
    }
    if (action.kind === "storePage") {
      if (!budget.consume("storePage")) { stopReason = "budget"; break; }
      storePageCalls += 1;
      pagedTokens.add(action.candidate.token);
      try {
        const extra = await provider.offersFor(action.candidate, query, action.token);
        const extraStores = uniqueStores(extra);
        for (const store of extraStores) knownStoreSet.add(store);
        for (const offer of extra) knownKeys.add(offerKey(offer));
        detailOffers.push(...extra);
        diagnostics.push({ stage: "store_page", title: action.candidate.title, productId: action.candidate.productId, offerCount: extra.length });
      } catch { failedStorePages += 1; }
      continue;
    }
    if (!budget.consume("detail")) { stopReason = "budget"; break; }
    let batch: SearchedProduct[] = [];
    try { batch = await provider.offersFor(action.candidate, query); }
    catch { failedDetails.push(action.candidate); opened.push(action.candidate); continue; }
    opened.push(action.candidate);
    const newStoreNames = uniqueStores(batch);
    const addedStores = [...newStoreNames].filter((store) => !knownStoreSet.has(store)).length;
    lastNewStores = addedStores;
    pageYield.set(action.candidate.token, addedStores);
    for (const store of newStoreNames) knownStoreSet.add(store);
    for (const offer of batch) knownKeys.add(offerKey(offer));
    detailOffers.push(...batch);
    diagnostics.push({ stage: "details", title: action.candidate.title, productId: action.candidate.productId, detailsFetched: true, multipleSources: Boolean(action.candidate.multipleSources), newStores: addedStores, offerCount: batch.length });
  }
  if (budget.remaining() === 0) stopReason = "budget";
  if (!opened.length && !allDetailCandidates.length) stopReason = "no_candidates";
  mark("details");

  for (const item of allDetailCandidates.filter((item) => !opened.some((chosen) => chosen.productId === item.productId))) diagnostics.push({ stage: "details", sourceQuery: item.sourceQuery, position: item.sourcePosition, title: item.title, productId: item.productId, detailsFetched: false, reason: "detail_limit" });
  for (const item of detailOffers) {
    const evaluation = evaluateOfferMatch(item, query);
    diagnostics.push({ stage: "details", sourceQuery: item.sourceQuery, position: item.sourcePosition, title: item.title, productTitle: item.productTitle, price: item.price, store: item.store, productId: item.productId, imageUrl: item.imageUrl, detailsFetched: true, productMatch: evaluation.eligible ? "PASS" : "FAIL", reason: evaluation.reason, normalized: evaluation.normalized, confidence: evaluation.confidence });
  }

  const presented = presentShopperOffers([...raw, ...detailOffers], query, diagnostics);
  mark("ranking");
  if (process.env.NODE_ENV !== "production") {
    console.info("[shopper.discovery]", JSON.stringify({
      stopReason,
      searchCalls: budget.spent.search,
      detailCalls: budget.spent.detail,
      storePageCalls,
      cardsConsidered: allDetailCandidates.length,
      cardsOpened: opened.length,
      multipleSourcesOpened: opened.filter((item) => item.multipleSources).length,
      offersDiscovered: presented.results.length,
      stores: uniqueStores(presented.results).size,
      googleRan,
      fallbackPhrases,
    }));
    for (const row of diagnostics) console.info("[SHOPPER_SEARCH]", JSON.stringify(row));
  }
  return {
    results: presented.results,
    variations: presented.variations,
    catalogOffers: presented.identityOffers,
    openedCandidates: opened,
    metrics: {
      timingsMs: { total: milestones.ranking, milestones },
      stageCounts: {
        rawSearch: successful.reduce((sum, item) => sum + item.rawCount, 0) + (googleRan ? raw.length : 0),
        parsedSearch: raw.length,
        detailCandidates: allDetailCandidates.length,
        enrichedProducts: opened.length,
        pageableProducts: opened.filter((item) => provider.nextStorePageTokens.has(item.token)).length,
        storePagesFetched: storePageCalls,
        unpagedProducts: Math.max(0, opened.filter((item) => provider.nextStorePageTokens.has(item.token)).length - storePageCalls),
        extractedDetailOffers: detailOffers.length,
        beforeCompatibility: raw.length + detailOffers.length,
        afterCompatibility: presented.compatibleOffers.length,
        afterDeduplication: presented.eligible.length,
        afterRanking: presented.results.length,
        finalOffers: presented.results.length,
        finalVariations: presented.variations.length,
      },
      queries: [query.query, ...fallbackPhrases],
      searchCalls: budget.spent.search,
      detailCalls: budget.spent.detail,
      storePageCalls,
      failedStorePages,
      shoppingWaitMs: googleRan ? shoppingWaitAfterGoogleMs : shoppingWaitWithoutGoogleMs,
      sourcesExcludedByWait: [] as string[],
      exactSourceLifecycle,
      rawResults: successful.reduce((sum, item) => sum + item.rawCount, 0),
      uniqueResults: presented.uniqueKeys,
      retainedResults: presented.results.length,
      variationCount: presented.variations.length,
      offerCount: presented.results.length,
      failedSearches: exactSourceLifecycle.filter((item) => item.failed).map((item) => String(item.engine)),
      failedDetails: failedDetails.length,
      stopReason,
      memory: { used: false, reason: "discovery" },
      sources: { google: provider.googleDiagnostics, shopping: provider.shoppingDiagnostics },
      diagnostics,
    },
  };
}
