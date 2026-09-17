import { SerpApiProductSearchProvider, type ProductDetailCandidate } from "./serpApiProductSearchProvider.js";
import type { SearchedProduct, ShopperQuery, ShopperVariation } from "./productSearchProvider.js";
import { evaluateProductMatch, matchesRequiredIntent, normalizeShopperText, shopperTokens, tokenMatches } from "./shopperIntentService.js";

const MAX_DETAILS = 4;
const searchConcurrency = 2;
const detailConcurrency = 2;

function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim(); }

export function expandQueries(query: ShopperQuery) {
  const base = query.query.trim();
  const normalizedUnits = normalizeShopperText(base);
  const terms = shopperTokens(base).join(" ");
  const withoutAttributeLabels = terms.split(" ").filter((term) => !["tamanho", "capacidade", "peso", "cor"].includes(term)).join(" ");
  return [...new Set([base, normalizedUnits, withoutAttributeLabels, terms].filter(Boolean))];
}

function normalizedUrl(value: string) {
  try { const url = new URL(value); url.hash = ""; for (const key of [...url.searchParams.keys()]) if (/^(utm_|gclid|fbclid)/i.test(key)) url.searchParams.delete(key); return url.toString(); } catch { return value; }
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
    if (!target.variation.offers.some((old) => normalizedUrl(old.productUrl) === normalizedUrl(offer.productUrl) && old.price === offer.price)) target.variation.offers.push(offer);
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

export async function discoverProducts(query: ShopperQuery, provider = new SerpApiProductSearchProvider()) {
  const phrases = expandQueries(query);
  let searchCalls = 3;
  const [exact, exactShopping, exactLight] = await Promise.all([
    provider.searchGoogleResults(query).catch(() => []),
    provider.searchDetailed(query, query.query).catch(() => null),
    provider.searchDetailed(query, query.query, "google_shopping_light").catch(() => null),
  ]);
  const initial = [...exact, ...(exactShopping?.results || []), ...(exactLight?.results || [])].filter((item) => item.price != null && matchesRequiredIntent(item, query) && evaluateProductMatch([item.title, item.productTitle, item.attributesText].filter(Boolean).join(" "), query).confidence >= 70);
  const enoughExactResults = new Set(initial.map((item) => normalizedUrl(item.productUrl))).size >= 8;
  const fallbackPhrases = enoughExactResults ? [] : phrases.slice(1, 4);
  const searched = await limited(fallbackPhrases, searchConcurrency, async (phrase) => {
    searchCalls++;
    return provider.searchDetailed(query, phrase, "google_shopping_light");
  });
  const successful = [...(exactShopping ? [exactShopping] : []), ...(exactLight ? [exactLight] : []), ...searched.flatMap((entry) => entry.status === "fulfilled" ? [entry.value] : [])];
  if (!successful.length && !exact.length) throw new Error("Nenhuma consulta ao shopping pôde ser concluída.");
  const raw = [...exact, ...successful.flatMap((entry) => entry.results)];
  const diagnostics: Array<Record<string, unknown>> = raw.map((item) => {
    const evaluation = evaluateProductMatch([item.title, item.productTitle, item.attributesText].filter(Boolean).join(" "), query);
    return { stage: "search", sourceQuery: item.sourceQuery, position: item.sourcePosition, title: item.title, price: item.price, store: item.store, productId: item.productId, imageUrl: item.imageUrl, preFilter: evaluation.eligible ? "PASS" : "DEFERRED_TO_DETAILS", reason: evaluation.reason, normalized: evaluation.normalized };
  });
  // Never use title-only eligibility as a gate for product details: Google often
  // puts the real composition in the immersive product data rather than the card.
  const allDetailCandidates = [...new Map(successful.flatMap((entry) => entry.detailCandidates).sort((a, b) => b.relevance - a.relevance).map((item) => [item.productId, item] as [string, ProductDetailCandidate])).values()];
  const candidates = enoughExactResults ? [] : allDetailCandidates.slice(0, MAX_DETAILS);
  for (const item of allDetailCandidates.slice(candidates.length)) diagnostics.push({ stage: "details", sourceQuery: item.sourceQuery, position: item.sourcePosition, title: item.title, productId: item.productId, detailsFetched: false, reason: enoughExactResults ? "enough_exact_results" : "detail_limit" });
  const detailed = await limited(candidates, detailConcurrency, (item) => provider.offersFor(item, query));
  const offers = detailed.flatMap((entry) => entry.status === "fulfilled" ? entry.value : []);
  for (const item of offers) {
    const evaluation = evaluateProductMatch([item.title, item.productTitle, item.attributesText].filter(Boolean).join(" "), query);
    diagnostics.push({ stage: "details", sourceQuery: item.sourceQuery, position: item.sourcePosition, title: item.title, productTitle: item.productTitle, price: item.price, store: item.store, productId: item.productId, imageUrl: item.imageUrl, detailsFetched: true, productMatch: evaluation.eligible ? "PASS" : "FAIL", reason: evaluation.reason, normalized: evaluation.normalized, confidence: evaluation.confidence });
  }
  const byUrl = new Map<string, SearchedProduct>();
  for (const item of [...raw, ...offers]) {
    const key = `${normalizedUrl(item.productUrl)}:${item.price ?? ""}`;
    const existing = byUrl.get(key);
    if (!existing) byUrl.set(key, item);
    else diagnostics.push({ stage: "deduplication", title: item.title, productId: item.productId, store: item.store, price: item.price, deduplicated: true, survivorId: existing.id, reason: "same_product_store_title_price" });
  }
  const eligible = [...byUrl.values()].filter((item) => {
    const eligible = matchesRequiredIntent(item, query);
    if (!eligible) diagnostics.push({ stage: "offer", title: item.title, price: item.price, store: item.store, productId: item.productId, offerMatch: "FAIL", reason: evaluateProductMatch([item.title, item.productTitle, item.attributesText].filter(Boolean).join(" "), query).reason || "price_out_of_range" });
    return eligible;
  });
  const pricedEligible = eligible.filter((item) => item.price != null);
  const ranked = rankProducts(pricedEligible.length ? pricedEligible : eligible, query);
  const cutoff = Math.max(55, (ranked[0]?.match.query || 0) - 20);
  const results = ranked.filter((item) => {
    if (item.match.query >= cutoff) return true;
    diagnostics.push({ stage: "ranking", title: item.title, score: item.match.query, reason: "low_relevance" });
    return false;
  });
  const grouped = groupVariations(results);
  const variations = grouped;
  const visibleResults = variations.flatMap((variation) => variation.offers);
  if (process.env.NODE_ENV !== "production") for (const row of diagnostics) console.info("[SHOPPER_SEARCH]", JSON.stringify(row));
  return { results: visibleResults, variations, metrics: { queries: [query.query, ...fallbackPhrases], searchCalls, detailCalls: candidates.length, rawResults: exact.length + successful.reduce((sum, item) => sum + item.rawCount, 0), uniqueResults: byUrl.size, retainedResults: visibleResults.length, variationCount: variations.length, offerCount: visibleResults.length, failedSearches: [...(exactShopping || exactLight ? [] : [query.query]), ...searched.flatMap((entry, index) => entry.status === "rejected" ? [fallbackPhrases[index]] : [])], failedDetails: detailed.filter((entry) => entry.status === "rejected").length, sources: { google: provider.googleDiagnostics, shopping: provider.shoppingDiagnostics }, diagnostics } };
}
