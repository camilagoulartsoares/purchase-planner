import type { SearchedProduct, ShopperQuery } from "./productSearchProvider.js";

const stopwords = new Set(["a", "as", "o", "os", "de", "da", "do", "das", "dos", "e", "em", "no", "na", "nos", "nas", "para", "por", "com", "um", "uma", "que", "quero", "procuro", "buscar", "encontrar", "reais", "r"]);
const quantityPattern = /^(\d+)(ml|g|gb|tb|mm|cm)$/;

const queryAttributeLabels = new Set(["tamanho", "capacidade", "peso", "cor"]);

// Shared vocabulary of color attributes, independent of product category or brand.
const colorFamilies = [
  ["preto", "preta", "black"], ["branco", "branca", "white"], ["azul", "blue"],
  ["rosa", "pink"], ["vermelho", "vermelha", "red"], ["verde", "green"],
  ["amarelo", "amarela", "yellow"], ["roxo", "roxa", "purple"], ["lilas", "violeta", "violet"],
  ["cinza", "cinzento", "cinzenta", "gray", "grey"], ["marrom", "castanho", "castanha", "brown"],
  ["bege", "beige"], ["laranja", "orange"], ["dourado", "dourada", "gold"],
  ["prata", "prateado", "prateada", "silver"], ["nude"],
  ["turquesa", "turquoise"], ["bordo", "burgundy"], ["terracota", "terracotta"],
  ["grafite", "graphite"], ["marinho", "navy"], ["coral"],
];

// Some color names are also foods, scents or materials. Read them as colors
// only when the listing explicitly labels a color or shade.
const contextualColorFamilies = [
  ["salmao", "salmon"], ["lavanda", "lavender"], ["vinho", "wine"],
  ["caramelo", "caramel"], ["creme", "cream"], ["mostarda", "mustard"],
  ["chocolate"], ["menta", "mint"],
];

function colorAttributes(value: string) {
  const tokens = shopperTokens(value);
  const colors = colorFamilies.flatMap((aliases, index) => aliases.some((alias) => tokens.includes(alias)) ? [index] : []);
  if (/\b(?:cor|cores|multicor|multicores|tonalidade|color|colour)\b/.test(normalizeShopperText(value))) {
    colors.push(...contextualColorFamilies.flatMap((aliases, index) => aliases.some((alias) => tokens.includes(alias)) ? [colorFamilies.length + index] : []));
  }
  return new Set(colors);
}

function similarityClaimMatchesQuery(rawText: string, query: ShopperQuery) {
  const text = normalizeShopperText(rawText);
  const queryText = normalizeShopperText(query.query);
  const requested = new Set(shopperTokens([query.query, ...query.brands].join(" ")));
  const claims = text.matchAll(/\b(?:estilo|tipo|similar(?:es)?(?:\s+a|\s+ao)?|inspirad[oa]s?\s+em|compativel\s+com|imitacao\s+de)\s+([\p{L}\d]+(?:\s+[\p{L}\d]+){0,2})/gu);
  for (const claim of claims) {
    const target = shopperTokens(claim[1]);
    // If the shopper used the same similarity expression, similarity is the
    // requested attribute rather than a contradiction of product identity.
    const marker = claim[0].slice(0, claim[0].indexOf(claim[1])).trim();
    if (target[0] && queryText.includes(`${marker} ${target[0]}`)) continue;
    if (target.some((term) => term.length > 2 && requested.has(term))) return true;
  }
  return false;
}

function genderAttribute(value: string) {
  const tokens = shopperTokens(value);
  if (tokens.some((token) => ["feminino", "feminina"].includes(token))) return "feminine";
  if (tokens.some((token) => ["masculino", "masculina"].includes(token))) return "masculine";
  return null;
}

export function normalizeShopperText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\b(\d+(?:[.,]\d+)?)\s*(?:mililitros?|mls?)\b/g, (_, amount: string) => `${Math.round(Number(amount.replace(",", ".")))}ml`)
    .replace(/\b(\d+(?:[.,]\d+)?)\s*(?:litros?|l)\b/g, (_, amount: string) => `${Math.round(Number(amount.replace(",", ".")) * 1000)}ml`)
    .replace(/\b(\d+(?:[.,]\d+)?)\s*(?:gramas?)\b/g, (_, amount: string) => `${Math.round(Number(amount.replace(",", ".")))}g`)
    .replace(/\b(\d+(?:[.,]\d+)?)\s*(?:quilos?|kg)\b/g, (_, amount: string) => `${Math.round(Number(amount.replace(",", ".")) * 1000)}g`)
    .replace(/\b(\d+(?:[.,]\d+)?)\s*(?:gigabytes?|gb)\b/g, (_, amount: string) => `${Math.round(Number(amount.replace(",", ".")))}gb`)
    .replace(/\b(\d+)\s+(ml|g|tb|mm|cm)\b/g, "$1$2")
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
  const requestedColors = colorAttributes([query.query, ...query.colors].join(" "));
  const actualColors = colorAttributes(rawText);
  if (requestedColors.size && actualColors.size && ![...requestedColors].some((color) => actualColors.has(color))) return fail("color_conflict");
  const requestedGender = genderAttribute(query.query);
  const actualGender = genderAttribute(rawText);
  if (requestedGender && actualGender && requestedGender !== actualGender) return fail("gender_conflict");
  if (similarityClaimMatchesQuery(rawText, query)) return fail("brand_similarity_conflict");
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
  return evaluateOfferMatch(item, query).eligible;
}

export function evaluateOfferMatch(item: SearchedProduct, query: ShopperQuery): IntentEvaluation {
  // The seller's own title has precedence over broad product metadata. A 500 g
  // offer must not inherit 10 kg from the Google product page it belongs to.
  const title = evaluateProductMatch(item.title, query);
  if (["quantity_conflict", "size_conflict", "color_conflict", "gender_conflict", "brand_similarity_conflict"].includes(title.reason || "")) return title;
  return evaluateProductMatch([item.title, item.productTitle, item.attributesText].filter(Boolean).join(" "), query);
}

export function queryAttributeTokens(query: ShopperQuery) {
  return shopperTokens(query.query).filter((term) => !queryAttributeLabels.has(term));
}

export function matchesQueryAttributes(rawText: string, query: ShopperQuery) {
  const requested = queryAttributeTokens(query);
  const actual = shopperTokens(rawText);
  const confirmed = requested.filter((term) => actual.some((candidate) => tokenMatches(term, candidate)));
  const numeric = requested.filter((term) => /\d/.test(term));
  const coverage = confirmed.length / Math.max(1, requested.length);
  const missing = requested.filter((term) => !confirmed.includes(term));
  return {
    // An absent measurement is unknown only when every other query term is
    // present. Explicit contradictions are rejected before ranking.
    eligible: coverage >= .7 && (numeric.every((term) => confirmed.includes(term)) || missing.every((term) => numeric.includes(term))),
    coverage,
    confirmed,
    numeric,
  };
}
