import type { SearchedProduct, ShopperQuery } from "./productSearchProvider.js";

const stopwords = new Set(["a", "as", "o", "os", "de", "da", "do", "das", "dos", "e", "em", "no", "na", "nos", "nas", "para", "por", "com", "um", "uma", "que", "quero", "procuro", "buscar", "encontrar", "reais", "r"]);
const quantityPattern = /^(\d+)(ml|g|gb|tb|mm|cm)$/;

export function normalizeShopperText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\b(\d+(?:[.,]\d+)?)\s*(?:litros?|l)\b/g, (_, amount: string) => `${Math.round(Number(amount.replace(",", ".")) * 1000)}ml`)
    .replace(/\b(\d+(?:[.,]\d+)?)\s*(?:quilos?|kg)\b/g, (_, amount: string) => `${Math.round(Number(amount.replace(",", ".")) * 1000)}g`)
    .replace(/\b(\d+)\s+(ml|g|gb|tb|mm|cm)\b/g, "$1$2")
    .replace(/\b(?:tam\.?|tamanho)\s*(\d{1,3})\b/g, "tamanho $1")
    .replace(/[\u2010-\u2015]/g, "-").replace(/\s+/g, " ").trim();
}

export function shopperTokens(value: string) {
  return [...new Set((normalizeShopperText(value).match(/[\p{L}\d]+/gu) || []).filter((token) => !stopwords.has(token)))];
}

export function tokenMatches(expected: string, actual: string) {
  if (expected === actual) return true;
  if (/\d/.test(expected) || /\d/.test(actual)) return false;
  const shorter = expected.length < actual.length ? expected : actual;
  const longer = expected.length < actual.length ? actual : expected;
  return shorter.length >= 2 && longer.length >= 5 && longer.startsWith(shorter);
}

function money(value: string) { return Number(value.replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".")); }
function price(message: string, kind: "max" | "min") {
  const text = normalizeShopperText(message);
  const prefix = kind === "max" ? "(?:ate|no maximo|menos de|abaixo de)" : "(?:a partir de|acima de|mais de|no minimo)";
  const match = new RegExp(`\\b${prefix}\\s*(?:r\\$\\s*)?([\\d.,]+)`, "i").exec(text);
  const amount = match ? money(match[1]) : null;
  return amount != null && Number.isFinite(amount) && amount > 0 ? amount : null;
}

function searchPhrase(message: string) {
  return message.replace(/\b(?:ate|até|no m[aá]ximo|menos de|abaixo de|a partir de|acima de|mais de|no m[ií]nimo)\s*(?:r\$\s*)?[\d.,]+\s*(?:reais?)?/gi, " ")
    .replace(/^(?:agora quero|nova busca|outro produto|em vez de|quero (?:procurar|buscar|encontrar)?|procure|busque)\s*/i, "")
    .replace(/\s+/g, " ").trim();
}

export function interpretShopperIntent(message: string, previous: ShopperQuery | null, proposed?: ShopperQuery | null): ShopperQuery {
  const text = normalizeShopperText(message);
  const clean = searchPhrase(message);
  const reset = /^(?:agora quero|nova busca|outro produto|em vez de)\b/.test(text);
  const refinement = /^(?:ate|no maximo|a partir de|prefiro|so|tambem|com|sem)\b/.test(text);
  const previousPhrase = previous?.query || "";
  const repeated = previousPhrase && normalizeShopperText(clean) === normalizeShopperText(previousPhrase);
  const extended = previousPhrase && normalizeShopperText(clean).startsWith(`${normalizeShopperText(previousPhrase)} `);
  const newProduct = reset || (!refinement && !repeated && !extended && clean.length > 2);
  const baseline = newProduct ? null : previous;
  const extra = refinement ? clean.replace(/^(?:prefiro|s[oó](?: da linha)?|tamb[eé]m|com|sem)\s*/i, "").trim() : "";
  const query = newProduct ? clean : extended ? clean : [previousPhrase || clean, extra].filter(Boolean).join(" ").trim();
  const maxPrice = price(message, "max") ?? baseline?.maxPrice ?? null;
  const minPrice = price(message, "min") ?? baseline?.minPrice ?? null;
  return {
    query, category: proposed?.category || baseline?.category || null,
    maxPrice, minPrice, maxPriceIsHard: maxPrice != null, currency: "BRL",
    colors: proposed?.colors || baseline?.colors || [], size: proposed?.size || baseline?.size || null,
    brands: proposed?.brands || baseline?.brands || [], requiredBrands: [], requiredLine: null,
    requiredComponents: [], requiredVolumes: [], requiredComponentVolumes: {}, requiredModelTerms: [],
    requiredKit: false, usage: proposed?.usage || baseline?.usage || null,
    style: proposed?.style || baseline?.style || [], exclude: proposed?.exclude || baseline?.exclude || [],
    originalOnly: proposed?.originalOnly || baseline?.originalOnly || false,
    sortPreference: proposed?.sortPreference || baseline?.sortPreference || "best_match",
  };
}

export type IntentEvaluation = { eligible: boolean; reason: string | null; normalized: string; confirmed: string[]; confidence: number };

function requestedPair(query: ShopperQuery) {
  const match = normalizeShopperText(query.query).match(/\b([\p{L}\d]+)\s+e\s+([\p{L}\d]+)\b/u);
  return match ? [match[1], match[2]] : [];
}

function contradictoryQuantity(expected: string[], actual: string[]) {
  const expectedQuantities = expected.map((token) => token.match(quantityPattern)).filter((match): match is RegExpMatchArray => !!match);
  const actualQuantities = actual.map((token) => token.match(quantityPattern)).filter((match): match is RegExpMatchArray => !!match);
  for (const term of expectedQuantities) {
    const requestedUnitCount = expectedQuantities.filter((candidate) => candidate[2] === term[2]).length;
    const sameUnit = actualQuantities.filter((candidate) => candidate[2] === term[2]);
    if (sameUnit.length >= requestedUnitCount && !sameUnit.some((candidate) => candidate[1] === term[1])) return true;
  }
  return false;
}

export function evaluateProductMatch(rawText: string, query: ShopperQuery): IntentEvaluation {
  const normalized = normalizeShopperText(rawText);
  const expected = shopperTokens(query.query);
  const actual = shopperTokens(rawText);
  const confirmed = expected.filter((term) => actual.some((candidate) => tokenMatches(term, candidate)));
  const fail = (reason: string): IntentEvaluation => ({ eligible: false, reason, normalized, confirmed, confidence: Math.round(100 * confirmed.length / Math.max(1, expected.length)) });
  if (contradictoryQuantity(expected, actual)) return fail("quantity_conflict");
  const size = /\btamanho\s*(\d{1,3})\b/.exec(normalizeShopperText(query.query))?.[1];
  if (size) {
    const sizes = [...normalized.matchAll(/(?<![\d])\d{1,3}(?![\d]|\s*(?:ml|g|gb|tb|mm|cm)\b)/g)].map((match) => String(Number(match[0]))).filter((value) => Number(value) >= 20 && Number(value) <= 60);
    if (sizes.length && !sizes.includes(size)) return fail("size_conflict");
  }
  const pair = requestedPair(query);
  if (pair.length && !pair.every((term) => actual.some((candidate) => tokenMatches(term, candidate)))) return fail("composition_missing");
  if (expected.length && !confirmed.length) return fail("no_query_overlap");
  return { eligible: true, reason: null, normalized, confirmed, confidence: Math.round(100 * confirmed.length / Math.max(1, expected.length)) };
}

export function matchesMandatoryAttributes(rawTitle: string, query: ShopperQuery) { return evaluateProductMatch(rawTitle, query).eligible; }

export function matchesRequiredIntent(item: SearchedProduct, query: ShopperQuery) {
  if (query.maxPrice != null && query.maxPriceIsHard && (item.price == null || item.price > query.maxPrice)) return false;
  if (query.minPrice != null && (item.price == null || item.price < query.minPrice)) return false;
  return evaluateProductMatch([item.title, item.productTitle, item.attributesText].filter(Boolean).join(" "), query).eligible;
}
