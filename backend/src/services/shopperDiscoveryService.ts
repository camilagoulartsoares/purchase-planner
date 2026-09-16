import { SerpApiProductSearchProvider, type ProductDetailCandidate } from "./serpApiProductSearchProvider.js";
import type { SearchedProduct, ShopperQuery, ShopperVariation } from "./productSearchProvider.js";
import { evaluateProductMatch, matchesRequiredIntent } from "./shopperIntentService.js";
import { preferredMerchants } from "./shopperMerchantService.js";

const MAX_QUERIES = 5;
const MAX_DETAILS = 20;
const searchConcurrency = 2;
const detailConcurrency = 2;

function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim(); }
const merchantRank = (merchant?: string) => { const index = preferredMerchants.indexOf(merchant as typeof preferredMerchants[number]); return index < 0 ? preferredMerchants.length : index; };

export function expandQueries(query: ShopperQuery) {
  const base = query.query.trim();
  const parts = base.split(/\s+/);
  const brand = query.requiredBrands?.[0] || query.brands[0] || parts.find((part, index) => index > 0 && /^[A-ZÁÉÍÓÚ][a-záéíóú]+$/.test(part)) || "";
  const core = brand ? base.replace(new RegExp(`\\b${brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"), "").replace(/\s+/g, " ").trim() : base;
  const candidates = [base];
  const qualifier = [brand, query.requiredLine || "", ...(query.requiredVolumes || [])].filter(Boolean).join(" ");
  for (const group of query.requiredComponents || []) if (group.length > 1) {
    candidates.push(`kit ${group.join(" ")} ${qualifier}`);
    candidates.push(`${brand} ${group.join(" ")} ${(query.requiredVolumes || []).join(" ")}`.trim());
    candidates.push(`${brand} ${group.join(" ")} duo`.trim());
  }
  if (brand && normalize(core).startsWith("kit ")) {
    candidates.push(`kit ${qualifier}`);
    candidates.push(`kit ${brand} ${core.replace(/^kit\s+/i, "")}`);
  }
  const pair = [
    ["shampoo", "condicionador"], ["shampoo", "máscara"],
    ["câmera", "lente"], ["celular", "carregador"],
  ].find(([word]) => normalize(base).includes(normalize(word)));
  if (pair && brand && normalize(base).includes("kit")) {
    candidates.push(`${pair[0]} e ${pair[1]} ${qualifier}`);
    candidates.push(`kit ${pair[0]} ${pair[1]} ${qualifier}`);
  } else if (brand) {
    candidates.push(`${core} ${brand}`);
    candidates.push(`${brand} ${core}`);
  } else {
    candidates.push(`${base} kit`);
    candidates.push(`${base} oferta`);
  }
  // Intent already removes price constraints. Keep queries recall-oriented and
  // enforce price only on each offer after it is retrieved.
  return [...new Map(candidates.filter(Boolean).map((value) => [normalize(value), value.trim()])).values()].slice(0, MAX_QUERIES);
}

function normalizedUrl(value: string) {
  try { const url = new URL(value); url.hash = ""; for (const key of [...url.searchParams.keys()]) if (/^(utm_|gclid|fbclid)/i.test(key)) url.searchParams.delete(key); return url.toString(); } catch { return value; }
}

function composition(title: string) {
  const text = normalize(title).replace(/(\d+)\s*(?:litros?|l)\b/g, (_, n: string) => `${Number(n) * 1000}ml`);
  const matches = [...text.matchAll(/\b(shampoo|condicionador|mascara|oleo|leave-in|serum|ampola|creme|sabonete|perfume|hidratante)\b/g)];
  if (!matches.length) return null;
  const components = matches.map((match, index) => {
    const tail = text.slice((match.index || 0) + match[0].length, matches[index + 1]?.index ?? text.length);
    const amount = tail.match(/\b(\d+)\s*(ml|g|unidades?)\b/);
    const multiplier = tail.match(/\b(\d+)\s*x\b/);
    return `${match[1]}:${amount ? amount[1] + amount[2] : "?"}:${multiplier?.[1] || "1"}`;
  }).sort();
  return components.join("|");
}

function descriptor(title: string) {
  return normalize(title).replace(/\b\d+\s*(?:ml|g|l|litros?|unidades?)\b/g, " ").replace(/\b(shampoo|condicionador|mascara|oleo|leave-in|serum|ampola|creme|sabonete|perfume|hidratante|kit|profissionais?|professionals?|produtos?|para|com|salon|duo|trio|e|de|da|do)\b/g, " ").split(/[^a-z0-9]+/).filter((token) => token.length > 2).sort().join("-");
}

export function groupVariations(results: SearchedProduct[]): ShopperVariation[] {
  const groups = new Map<string, ShopperVariation>();
  for (const offer of results) {
    const productIdentity = offer.productTitle || offer.title;
    const make = composition(productIdentity);
    // A Google product ID alone is not enough: its stores may carry different kit sizes.
    // An unknown composition remains isolated unless its title is exactly equivalent.
    const exactTitle = normalize(productIdentity).replace(/[^a-z0-9]+/g, "");
    const key = offer.productId && make && !make.includes("?") ? `${offer.productId}:${descriptor(productIdentity)}:${make}` : `${offer.productId || "no-id"}:${exactTitle}`;
    let group = groups.get(key);
    if (!group) { group = { id: key, title: offer.productTitle || offer.title, imageUrl: offer.imageUrl, imageSource: offer.imageSource || null, offers: [] }; groups.set(key, group); }
    if (!group.offers.some((old) => (normalizedUrl(old.productUrl) === normalizedUrl(offer.productUrl) || (old.productId === offer.productId && old.store === offer.store && normalize(old.title) === normalize(offer.title))) && old.price === offer.price)) group.offers.push(offer);
    if (!group.imageUrl && offer.imageUrl) { group.imageUrl = offer.imageUrl; group.imageSource = offer.imageSource || null; }
  }
  return [...groups.values()].map((group) => {
    const offers = group.offers.sort((a, b) => b.match.total - a.match.total || merchantRank(a.merchant) - merchantRank(b.merchant) || (a.price ?? Infinity) - (b.price ?? Infinity));
    // A group's product image is valid for all offers in this exact composition.
    const imageOffer = offers.find((offer) => offer.imageUrl);
    return { ...group, imageUrl: imageOffer?.imageUrl || group.imageUrl, imageSource: imageOffer?.imageSource || group.imageSource, offers };
  }).sort((a, b) => ((b.offers[0]?.match.total || 0) + Math.min(b.offers.length - 1, 4) * 5) - ((a.offers[0]?.match.total || 0) + Math.min(a.offers.length - 1, 4) * 5));
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
  let searchCalls = 0;
  const searched = await limited(phrases, searchConcurrency, async (phrase) => {
    try { searchCalls++; return await provider.searchDetailed(query, phrase); }
    catch { searchCalls++; return provider.searchDetailed(query, phrase); }
  });
  const successful = searched.flatMap((entry) => entry.status === "fulfilled" ? [entry.value] : []);
  if (!successful.length) throw new Error("Nenhuma consulta ao shopping pôde ser concluída.");
  const raw = successful.flatMap((entry) => entry.results);
  const diagnostics: Array<Record<string, unknown>> = raw.map((item) => {
    const evaluation = evaluateProductMatch([item.title, item.productTitle, item.attributesText].filter(Boolean).join(" "), query);
    return { stage: "search", sourceQuery: item.sourceQuery, position: item.sourcePosition, title: item.title, price: item.price, store: item.store, productId: item.productId, imageUrl: item.imageUrl, preFilter: evaluation.eligible ? "PASS" : "DEFERRED_TO_DETAILS", reason: evaluation.reason, normalized: evaluation.normalized };
  });
  // Never use title-only eligibility as a gate for product details: Google often
  // puts the real composition in the immersive product data rather than the card.
  const allDetailCandidates = [...new Map(successful.flatMap((entry) => entry.detailCandidates).sort((a, b) => b.relevance - a.relevance).map((item) => [item.productId, item] as [string, ProductDetailCandidate])).values()];
  const candidates = allDetailCandidates.slice(0, MAX_DETAILS);
  for (const item of allDetailCandidates.slice(MAX_DETAILS)) diagnostics.push({ stage: "details", sourceQuery: item.sourceQuery, position: item.sourcePosition, title: item.title, productId: item.productId, detailsFetched: false, reason: "detail_limit" });
  const detailed = await limited(candidates, detailConcurrency, (item) => provider.offersFor(item, query));
  const offers = detailed.flatMap((entry) => entry.status === "fulfilled" ? entry.value : []);
  for (const item of offers) {
    const evaluation = evaluateProductMatch([item.title, item.productTitle, item.attributesText].filter(Boolean).join(" "), query);
    diagnostics.push({ stage: "details", sourceQuery: item.sourceQuery, position: item.sourcePosition, title: item.title, productTitle: item.productTitle, price: item.price, store: item.store, productId: item.productId, imageUrl: item.imageUrl, detailsFetched: true, productMatch: evaluation.eligible ? "PASS" : "FAIL", reason: evaluation.reason, normalized: evaluation.normalized, confidence: evaluation.confidence });
  }
  const byUrl = new Map<string, SearchedProduct>();
  for (const item of [...raw, ...offers]) {
    const key = item.productId ? `${item.productId}:${normalize(item.store || "")}:${normalize(item.title)}:${item.price ?? ""}` : `${normalizedUrl(item.productUrl)}:${item.store || ""}:${item.price ?? ""}`;
    const existing = byUrl.get(key);
    if (!existing) byUrl.set(key, item);
    else diagnostics.push({ stage: "deduplication", title: item.title, productId: item.productId, store: item.store, price: item.price, deduplicated: true, survivorId: existing.id, reason: "same_product_store_title_price" });
  }
  const results = [...byUrl.values()].filter((item) => {
    const eligible = matchesRequiredIntent(item, query);
    if (!eligible) diagnostics.push({ stage: "offer", title: item.title, price: item.price, store: item.store, productId: item.productId, offerMatch: "FAIL", reason: evaluateProductMatch([item.title, item.productTitle, item.attributesText].filter(Boolean).join(" "), query).reason || "price_out_of_range" });
    return eligible;
  }).sort((a, b) => b.match.total - a.match.total || (a.price ?? Infinity) - (b.price ?? Infinity));
  const grouped = groupVariations(results);
  // Image eligibility is deliberately last: detail data and another validated
  // offer in this exact composition may supply the product image.
  const variations = grouped.filter((variation) => {
    if (variation.imageUrl) return true;
    diagnostics.push({ stage: "display", groupKey: variation.id, title: variation.title, excludedReason: "missing_image", offerIds: variation.offers.map((offer) => offer.id) });
    return false;
  });
  const visibleResults = variations.flatMap((variation) => variation.offers);
  if (process.env.NODE_ENV !== "production") for (const row of diagnostics) console.info("[SHOPPER_SEARCH]", JSON.stringify(row));
  return { results: visibleResults, variations, metrics: { queries: phrases, searchCalls, detailCalls: candidates.length, rawResults: successful.reduce((sum, item) => sum + item.rawCount, 0), uniqueResults: byUrl.size, retainedResults: visibleResults.length, variationCount: variations.length, offerCount: visibleResults.length, failedSearches: searched.flatMap((entry, index) => entry.status === "rejected" ? [phrases[index]] : []), failedDetails: detailed.filter((entry) => entry.status === "rejected").length, diagnostics } };
}
