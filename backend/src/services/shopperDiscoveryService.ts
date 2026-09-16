import { SerpApiProductSearchProvider, type ProductDetailCandidate } from "./serpApiProductSearchProvider.js";
import type { SearchedProduct, ShopperQuery, ShopperVariation } from "./productSearchProvider.js";
import { matchesMandatoryAttributes, matchesRequiredIntent } from "./shopperIntentService.js";

const MAX_QUERIES = 5;
const MAX_DETAILS = 5;
const searchConcurrency = 2;
const detailConcurrency = 2;

function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim(); }

export function expandQueries(query: ShopperQuery) {
  const base = query.query.trim();
  const parts = base.split(/\s+/);
  const brand = query.requiredBrands?.[0] || query.brands[0] || parts.find((part, index) => index > 0 && /^[A-ZÁÉÍÓÚ][a-záéíóú]+$/.test(part)) || "";
  const core = brand ? base.replace(new RegExp(`\\b${brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"), "").replace(/\s+/g, " ").trim() : base;
  const candidates = [base];
  const qualifier = [brand, query.requiredLine || "", ...(query.requiredVolumes || [])].filter(Boolean).join(" ");
  for (const group of query.requiredComponents || []) if (group.length > 1) candidates.push(`kit ${group.join(" ")} ${qualifier}`);
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
  return [...new Map(candidates.map((value) => [normalize(value), value.trim()])).values()].slice(0, MAX_QUERIES);
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
    const make = composition(offer.title);
    // A Google product ID alone is not enough: its stores may carry different kit sizes.
    // An unknown composition remains isolated unless its title is exactly equivalent.
    const exactTitle = normalize(offer.title).replace(/[^a-z0-9]+/g, "");
    const key = offer.productId && make && !make.includes("?") ? `${offer.productId}:${descriptor(offer.title)}:${make}` : `${offer.productId || "no-id"}:${exactTitle}`;
    let group = groups.get(key);
    if (!group) { group = { id: key, title: offer.title, imageUrl: offer.imageUrl, offers: [] }; groups.set(key, group); }
    if (!group.offers.some((old) => (normalizedUrl(old.productUrl) === normalizedUrl(offer.productUrl) || (old.productId === offer.productId && old.store === offer.store && normalize(old.title) === normalize(offer.title))) && old.price === offer.price)) group.offers.push(offer);
    if (!group.imageUrl && offer.imageUrl) group.imageUrl = offer.imageUrl;
  }
  return [...groups.values()].map((group) => ({ ...group, offers: group.offers.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity)) })).sort((a, b) => ((b.offers[0]?.match.total || 0) + Math.min(b.offers.length - 1, 4) * 5) - ((a.offers[0]?.match.total || 0) + Math.min(a.offers.length - 1, 4) * 5));
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
  const candidates = [...new Map(successful.flatMap((entry) => entry.detailCandidates).filter((item) => matchesMandatoryAttributes(item.title, query)).sort((a, b) => b.relevance - a.relevance).map((item) => [item.productId, item] as [string, ProductDetailCandidate])).values()].slice(0, MAX_DETAILS);
  const detailed = await limited(candidates, detailConcurrency, (item) => provider.offersFor(item, query));
  const offers = detailed.flatMap((entry) => entry.status === "fulfilled" ? entry.value : []);
  const byUrl = new Map<string, SearchedProduct>();
  for (const item of [...raw, ...offers]) {
    const key = item.productId ? `${item.productId}:${normalize(item.store || "")}:${normalize(item.title)}:${item.price ?? ""}` : `${normalizedUrl(item.productUrl)}:${item.store || ""}:${item.price ?? ""}`;
    if (!byUrl.has(key)) byUrl.set(key, item);
  }
  const results = [...byUrl.values()].filter((item) => matchesRequiredIntent(item, query));
  const variations = groupVariations(results);
  return { results, variations, metrics: { queries: phrases, searchCalls, detailCalls: candidates.length, rawResults: successful.reduce((sum, item) => sum + item.rawCount, 0), brandMatchesRaw: query.requiredBrands?.length ? raw.filter((item) => matchesMandatoryAttributes(item.title, { ...query, requiredLine: null, requiredComponents: [], requiredVolumes: [], requiredModelTerms: [] })).length : null, uniqueResults: byUrl.size, retainedResults: results.length, variationCount: variations.length, offerCount: variations.reduce((sum, item) => sum + item.offers.length, 0), failedSearches: searched.flatMap((entry, index) => entry.status === "rejected" ? [phrases[index]] : []), failedDetails: detailed.filter((entry) => entry.status === "rejected").length } };
}
