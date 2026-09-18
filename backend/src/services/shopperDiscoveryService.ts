import { SerpApiProductSearchProvider, type ProductDetailCandidate } from "./serpApiProductSearchProvider.js";
import { preserveBetterOfferReview, type SearchedProduct, type ShopperQuery, type ShopperVariation } from "./productSearchProvider.js";
import { isExplicitlyUnavailable } from "./shopperAvailabilityService.js";
import { evaluateOfferMatch, evaluateProductMatch, matchesQueryAttributes, matchesRequiredIntent, normalizeShopperText, shopperTokens, tokenMatches } from "./shopperIntentService.js";

const MAX_DETAILS = 6;
const searchConcurrency = 2;
const detailConcurrency = 3;
const maxAdditionalStorePages = 2;
const shoppingWaitAfterGoogleMs = 8_000;
const shoppingWaitWithoutGoogleMs = 25_000;

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

function settleWithin<T>(promise: Promise<T>, ms: number, fallback: T): Promise<{ value: T; timedOut: boolean }> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ value: fallback, timedOut: true }), ms);
    promise.then((value) => { clearTimeout(timer); resolve({ value, timedOut: false }); }, () => { clearTimeout(timer); resolve({ value: fallback, timedOut: false }); });
  });
}

export async function discoverProducts(query: ShopperQuery, provider = new SerpApiProductSearchProvider()) {
  const startedAt = Date.now();
  const milestones: Record<string, number> = {};
  const mark = (stage: string) => { milestones[stage] = Date.now() - startedAt; };
  const phrases = expandQueries(query);
  let searchCalls = 3;
  const googlePromise = provider.searchGoogleResults(query).catch(() => [] as SearchedProduct[]);
  const shoppingPromise = provider.searchDetailed(query, query.query).catch(() => null);
  const lightPromise = provider.searchDetailed(query, query.query, "google_shopping_light").catch(() => null);
  const exact = await googlePromise;
  mark("google");
  const recoveredFromGoogle = provider.googleDetailCandidates.length > 0 || exact.some((item) => item.price != null);
  const shoppingWait = recoveredFromGoogle ? shoppingWaitAfterGoogleMs : shoppingWaitWithoutGoogleMs;
  const [shoppingOutcome, lightOutcome] = await Promise.all([
    settleWithin(shoppingPromise, shoppingWait, null),
    settleWithin(lightPromise, shoppingWait, null),
  ]);
  const exactShopping = shoppingOutcome.value;
  mark("shopping");
  const exactLight = lightOutcome.value;
  const initial = [...exact, ...(exactShopping?.results || []), ...(exactLight?.results || [])].filter((item) => item.price != null && matchesRequiredIntent(item, query) && evaluateProductMatch([item.title, item.productTitle, item.attributesText].filter(Boolean).join(" "), query).confidence >= 70);
  const enoughExactResults = new Set(initial.map((item) => normalizedUrl(item.productUrl))).size >= 8;
  let fallbackPhrases = enoughExactResults || provider.googleDetailCandidates.length > 0 ? [] : phrases.slice(1, 4);
  let searched = await limited(fallbackPhrases, searchConcurrency, async (phrase) => {
    searchCalls++;
    return provider.searchDetailed(query, phrase, "google_shopping_light");
  });
  const successful = [...(exactShopping ? [exactShopping] : []), ...(exactLight ? [exactLight] : []), ...searched.flatMap((entry) => entry.status === "fulfilled" ? [entry.value] : [])];
  mark("initialFallback");
  if (!successful.length && !exact.length && !provider.googleDetailCandidates.length) throw new Error("Nenhuma consulta ao shopping pôde ser concluída.");
  const raw = [...exact, ...successful.flatMap((entry) => entry.results)];
  const diagnostics: Array<Record<string, unknown>> = raw.map((item) => {
    const evaluation = evaluateProductMatch([item.title, item.productTitle, item.attributesText].filter(Boolean).join(" "), query);
    return { stage: "search", sourceQuery: item.sourceQuery, position: item.sourcePosition, title: item.title, price: item.price, store: item.store, productId: item.productId, imageUrl: item.imageUrl, preFilter: evaluation.eligible ? "PASS" : "DEFERRED_TO_DETAILS", reason: evaluation.reason, normalized: evaluation.normalized };
  });
  // Never use title-only eligibility as a gate for product details: Google often
  // puts the real composition in the immersive product data rather than the card.
  const allDetailCandidates = [...new Map([...provider.googleDetailCandidates, ...successful.flatMap((entry) => entry.detailCandidates)].sort((a, b) => b.relevance - a.relevance).map((item) => [item.productId, item] as [string, ProductDetailCandidate])).values()];
  // Keep one detail slot available for a candidate discovered by a late fallback.
  const firstCandidates = allDetailCandidates.slice(0, !enoughExactResults && provider.googleDetailCandidates.length ? MAX_DETAILS - 1 : MAX_DETAILS);
  const firstDetailed = await limited(firstCandidates, detailConcurrency, (item) => provider.offersFor(item, query));
  const firstOffers = firstDetailed.flatMap((entry) => entry.status === "fulfilled" ? entry.value : []);
  mark("initialDetails");
  if (!enoughExactResults && !fallbackPhrases.length && provider.googleDetailCandidates.length) {
    const compatible = [...raw, ...firstOffers].filter((item) => item.price != null && matchesRequiredIntent(item, query) && matchesQueryAttributes([item.title, item.productTitle, item.attributesText].filter(Boolean).join(" "), query).eligible);
    if (new Set(compatible.map((item) => offerKey(item))).size < 8) {
      fallbackPhrases = phrases.slice(1, 4);
      searched = await limited(fallbackPhrases, searchConcurrency, async (phrase) => {
        searchCalls++;
        return provider.searchDetailed(query, phrase, "google_shopping_light");
      });
      mark("lateFallback");
      for (const entry of searched) if (entry.status === "fulfilled") {
        successful.push(entry.value);
        for (const item of entry.value.results) {
          raw.push(item);
          const evaluation = evaluateProductMatch([item.title, item.productTitle, item.attributesText].filter(Boolean).join(" "), query);
          diagnostics.push({ stage: "search", sourceQuery: item.sourceQuery, position: item.sourcePosition, title: item.title, price: item.price, store: item.store, productId: item.productId, imageUrl: item.imageUrl, preFilter: evaluation.eligible ? "PASS" : "DEFERRED_TO_DETAILS", reason: evaluation.reason, normalized: evaluation.normalized });
        }
      }
    }
  }
  const remaining = [...new Map([...allDetailCandidates.slice(firstCandidates.length), ...successful.flatMap((entry) => entry.detailCandidates)]
    .filter((item) => !firstCandidates.some((first) => first.productId === item.productId))
    .sort((a, b) => b.relevance - a.relevance)
    .map((item) => [item.productId, item] as [string, ProductDetailCandidate])).values()];
  const finalCandidates = remaining.slice(0, MAX_DETAILS - firstCandidates.length);
  const candidates = [...firstCandidates, ...finalCandidates];
  for (const item of remaining.slice(finalCandidates.length)) diagnostics.push({ stage: "details", sourceQuery: item.sourceQuery, position: item.sourcePosition, title: item.title, productId: item.productId, detailsFetched: false, reason: "detail_limit" });
  const lastDetailed = await limited(finalCandidates, detailConcurrency, (item) => provider.offersFor(item, query));
  const detailed = [...firstDetailed, ...lastDetailed];
  mark("lastDetails");
  const offers = [...firstOffers, ...lastDetailed.flatMap((entry) => entry.status === "fulfilled" ? entry.value : [])];
  // One extra page for at most two selected products; each page has a six-second request timeout.
  const pageableCandidates = candidates.filter((item) => provider.nextStorePageTokens.has(item.token))
    .sort((a, b) => b.relevance - a.relevance);
  const storePageCandidates = pageableCandidates.slice(0, maxAdditionalStorePages);
  const storePages = await limited(storePageCandidates, maxAdditionalStorePages, (item) =>
    provider.offersFor(item, query, provider.nextStorePageTokens.get(item.token)));
  offers.push(...storePages.flatMap((entry) => entry.status === "fulfilled" ? entry.value : []));
  mark("storePages");
  for (const item of offers) {
    const evaluation = evaluateOfferMatch(item, query);
    diagnostics.push({ stage: "details", sourceQuery: item.sourceQuery, position: item.sourcePosition, title: item.title, productTitle: item.productTitle, price: item.price, store: item.store, productId: item.productId, imageUrl: item.imageUrl, detailsFetched: true, productMatch: evaluation.eligible ? "PASS" : "FAIL", reason: evaluation.reason, normalized: evaluation.normalized, confidence: evaluation.confidence });
  }
  const compatibleOffers = [...raw, ...offers].filter((item) => {
    if (isExplicitlyUnavailable(item.availability)) {
      diagnostics.push({ stage: "offer", title: item.title, price: item.price, store: item.store, productId: item.productId, offerMatch: "FAIL", reason: "out_of_stock" });
      return false;
    }
    if (matchesRequiredIntent(item, query)) return true;
    diagnostics.push({ stage: "offer", title: item.title, price: item.price, store: item.store, productId: item.productId, offerMatch: "FAIL", reason: evaluateOfferMatch(item, query).reason || "price_out_of_range" });
    return false;
  });
  const byUrl = new Map<string, SearchedProduct>();
  for (const item of compatibleOffers) {
    const key = offerKey(item);
    const existing = byUrl.get(key);
    if (!existing) byUrl.set(key, item);
    else { preserveBetterOfferReview(existing, item); diagnostics.push({ stage: "deduplication", title: item.title, productId: item.productId, store: item.store, price: item.price, deduplicated: true, discardedId: item.id, discardedUrl: item.productUrl, survivorId: existing.id, survivorUrl: existing.productUrl, dedupKey: key, reason: "same_offer_identity" }); }
  }
  const eligible = [...byUrl.values()];
  const pricedEligible = eligible.filter((item) => item.price != null);
  if (pricedEligible.length) for (const item of eligible) if (item.price == null) diagnostics.push({ stage: "offer", title: item.title, store: item.store, productId: item.productId, id: item.id, url: item.productUrl, offerMatch: "FAIL", reason: "unpriced_when_priced_available" });
  const ranked = rankProducts(pricedEligible.length ? pricedEligible : eligible, query);
  const results = ranked.filter((item) => {
    const fit = matchesQueryAttributes([item.title, item.productTitle, item.attributesText].filter(Boolean).join(" "), query);
    if (fit.eligible) return true;
    diagnostics.push({ stage: "ranking", title: item.title, score: item.match.query, coverage: fit.coverage, reason: "low_relevance" });
    return false;
  });
  const grouped = groupVariations(results);
  const variations = grouped;
  const visibleResults = variations.flatMap((variation) => variation.offers);
  mark("ranking");
  if (process.env.NODE_ENV !== "production") for (const row of diagnostics) console.info("[SHOPPER_SEARCH]", JSON.stringify(row));
  return { results: visibleResults, variations, metrics: { timingsMs: { total: milestones.ranking, milestones }, stageCounts: { rawSearch: exact.length + successful.reduce((sum, item) => sum + item.rawCount, 0), parsedSearch: raw.length, detailCandidates: allDetailCandidates.length, enrichedProducts: candidates.length, pageableProducts: pageableCandidates.length, storePagesFetched: storePageCandidates.length, unpagedProducts: pageableCandidates.length - storePageCandidates.length, extractedDetailOffers: offers.length, beforeCompatibility: raw.length + offers.length, afterCompatibility: compatibleOffers.length, afterDeduplication: eligible.length, afterRanking: results.length, finalOffers: visibleResults.length, finalVariations: variations.length }, queries: [query.query, ...fallbackPhrases], searchCalls, detailCalls: candidates.length, storePageCalls: storePageCandidates.length, failedStorePages: storePages.filter((entry) => entry.status === "rejected").length, shoppingWaitMs: shoppingWait, sourcesExcludedByWait: [shoppingOutcome.timedOut ? "google_shopping" : null, lightOutcome.timedOut ? "google_shopping_light" : null].filter(Boolean), rawResults: exact.length + successful.reduce((sum, item) => sum + item.rawCount, 0), uniqueResults: byUrl.size, retainedResults: visibleResults.length, variationCount: variations.length, offerCount: visibleResults.length, failedSearches: [...(exactShopping || exactLight ? [] : [query.query]), ...searched.flatMap((entry, index) => entry.status === "rejected" ? [fallbackPhrases[index]] : [])], failedDetails: detailed.filter((entry) => entry.status === "rejected").length, sources: { google: provider.googleDiagnostics, shopping: provider.shoppingDiagnostics }, diagnostics } };
}
