import type { SearchedProduct, ShopperQuery } from "./productSearchProvider.js";

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const cleanMoney = (value: string) => value.replace(/\b(?:a partir de|acima de|mais de|ate|até|no maximo|no máximo|menos de|abaixo de)\s*(?:r\$\s*)?\d{1,5}(?:[.,]\d{1,2})?\s*(?:reais?)?\b|r\$\s*\d{1,5}(?:[.,]\d{1,2})?/gi, " ").replace(/\s+/g, " ").trim();
const productWords = new Set(["kit", "tenis", "tênis", "shampoo", "condicionador", "mascara", "máscara", "protetor", "solar", "celular", "smartphone", "bolsa", "feminino", "masculino", "profissional", "professionals", "agora", "quero"]);
const componentWords = ["shampoo", "condicionador", "máscara", "mascara", "óleo", "oleo", "hidratante", "protetor"];
const queryBase = (value: string) => cleanMoney(value).replace(/\b(?:agora quero (?:procurar|buscar)?|quero (?:procurar|buscar|encontrar)|procure|busque)\b/gi, " ").replace(/\s+/g, " ").trim();

function price(message: string, kind: "max" | "min") {
  const pattern = kind === "max" ? /\b(?:ate|no maximo|menos de|abaixo de)\s*(?:r\$\s*)?(\d{1,5}(?:[.,]\d{1,2})?)/i : /\b(?:a partir de|acima de|mais de|no minimo)\s*(?:r\$\s*)?(\d{1,5}(?:[.,]\d{1,2})?)/i;
  const match = normalize(message).match(pattern);
  return match ? Number(match[1].replace(".", "").replace(",", ".")) : null;
}

function explicitBrand(message: string, previous: ShopperQuery | null) {
  if (/^(?:s[oó] da linha|prefiro|pode ser)\b/i.test(message.trim())) return null;
  const words = message.match(/\b[A-ZÁÉÍÓÚ][a-záéíóúA-ZÁÉÍÓÚ]{2,}\b/g) || [];
  const afterLine = /\blinha\s+([\p{L}\d-]+)/iu.exec(message)?.[1];
  const candidates = words.filter((word) => !productWords.has(normalize(word)) && normalize(word) !== normalize(afterLine || ""));
  const prior = previous?.requiredBrands?.find((brand) => normalize(message).includes(normalize(brand)));
  return prior || candidates[0] || null;
}

function components(message: string) {
  const normalized = normalize(message);
  return [...new Set(componentWords.filter((word) => normalized.includes(normalize(word))).map((word) => normalize(word)))];
}

function volumes(message: string) {
  return [...new Set([...normalize(message).matchAll(/\b(\d+)\s*(l|litros?|ml|g)\b/g)].map((match) => /^(l|litro)/.test(match[2]) ? `${Number(match[1]) * 1000}ml` : `${Number(match[1])}${match[2]}`))];
}

function modelTerms(message: string) {
  const normalized = normalize(message);
  if (!/\biphone\b/.test(normalized)) return [];
  return ["iphone", ...[...normalized.matchAll(/\b\d+(?:gb|tb)?\b/g)].map((match) => match[0])];
}

export function interpretShopperIntent(message: string, previous: ShopperQuery | null, proposed?: ShopperQuery | null): ShopperQuery {
  const normalized = normalize(message);
  const reset = /\b(?:agora quero|nova busca|outro produto|em vez de)\b/.test(normalized);
  const refinement = /^(?:ate|no maximo|a partir de|s[oó] da linha|prefiro|pode ser|tamb[eé]m|com|sem)\b/.test(normalized);
  const clean = queryBase(message);
  const previousBase = previous?.query || "";
  const repeatsPrevious = previous && normalize(clean) === normalize(previousBase);
  const extendsPrevious = previous && normalize(clean).startsWith(normalize(previousBase) + " ");
  const newProduct = reset || (!refinement && !repeatsPrevious && !extendsPrevious && clean.length > 2 && !/^(?:s[oó] da linha|prefiro|pode ser)/.test(normalized));
  const baseline = newProduct ? null : previous;
  const brand = explicitBrand(message, baseline) || proposed?.brands?.find((value) => normalized.includes(normalize(value))) || null;
  const baselineBrand = baseline?.requiredBrands?.[0] || (baseline ? explicitBrand(baseline.query, null) : null);
  const requiredBrands = brand ? [brand] : baselineBrand ? [baselineBrand] : [];
  const capitalized = message.match(/\b[A-ZÁÉÍÓÚ][a-záéíóúA-ZÁÉÍÓÚ]{2,}\b/g) || [];
  const inferredLine = brand ? capitalized.find((word) => normalize(word) !== normalize(brand) && !productWords.has(normalize(word))) : null;
  const line = /\blinha\s+([\p{L}\d-]+)/iu.exec(message)?.[1] || (/^prefiro\s+([\p{L}\d-]+)/iu.exec(message)?.[1]) || inferredLine || baseline?.requiredLine || null;
  const directComponents = components(message);
  let requiredComponents = baseline?.requiredComponents?.length ? baseline.requiredComponents : baseline?.query ? [components(baseline.query)] : [];
  if (newProduct) requiredComponents = directComponents.length ? [directComponents] : [];
  else if (directComponents.length > 1) requiredComponents = /pode ser|tamb[eé]m/i.test(message) ? [...requiredComponents, directComponents] : [directComponents];
  const requiredVolumes = volumes(message).length ? volumes(message) : baseline?.requiredVolumes || [];
  const requiredModelTerms = modelTerms(message).length ? modelTerms(message) : baseline?.requiredModelTerms || [];
  const maxPrice = price(message, "max") ?? baseline?.maxPrice ?? null;
  const minPrice = price(message, "min") ?? baseline?.minPrice ?? null;
  const base = newProduct ? clean : previousBase || clean;
  const query = line && !normalize(base).includes(normalize(line)) ? `${base} ${line}` : base;
  const interpreted = proposed && !newProduct ? proposed : null;
  return {
    query, category: newProduct ? proposed?.category || null : baseline?.category || interpreted?.category || null,
    maxPrice, minPrice, maxPriceIsHard: maxPrice != null, currency: "BRL",
    colors: newProduct ? proposed?.colors || [] : baseline?.colors || proposed?.colors || [],
    size: newProduct ? proposed?.size || null : baseline?.size || proposed?.size || null,
    brands: requiredBrands, requiredBrands, requiredLine: line, requiredComponents, requiredVolumes, requiredModelTerms,
    requiredKit: newProduct ? /\bkit\b/.test(normalized) : baseline?.requiredKit || /\bkit\b/.test(normalize(baseline?.query || "")),
    usage: newProduct ? proposed?.usage || null : baseline?.usage || proposed?.usage || null,
    style: newProduct ? proposed?.style || [] : baseline?.style || proposed?.style || [],
    exclude: newProduct ? proposed?.exclude || [] : baseline?.exclude || proposed?.exclude || [],
    originalOnly: newProduct ? proposed?.originalOnly || false : baseline?.originalOnly || proposed?.originalOnly || false,
    sortPreference: proposed?.sortPreference || baseline?.sortPreference || "best_match",
  };
}

export function matchesMandatoryAttributes(rawTitle: string, query: ShopperQuery) {
  const title = normalize(rawTitle);
  if (query.requiredBrands?.length && !query.requiredBrands.some((brand) => title.includes(normalize(brand)))) return false;
  if (query.requiredLine && !title.includes(normalize(query.requiredLine))) return false;
  if (query.requiredKit && !/\b(kit|combo|duo|trio|conjunto|[2-9]\s*(?:unidades|produtos))\b/.test(title) && components(title).length < 2) return false;
  if (query.requiredComponents?.length && !query.requiredComponents.some((group) => group.every((component) => title.includes(component)))) return false;
  if (query.requiredVolumes?.length && !query.requiredVolumes.every((volume) => {
    const amount = Number.parseInt(volume);
    return new RegExp(`\\b${amount}\\s*ml\\b`, "i").test(title) || (volume.endsWith("ml") && amount % 1000 === 0 && new RegExp(`\\b${amount / 1000}\\s*(?:l|litro)\\b`, "i").test(title));
  })) return false;
  if (query.requiredModelTerms?.length && !query.requiredModelTerms.every((term) => {
    const capacity = term.match(/^(\d+)(gb|tb)$/);
    return new RegExp(capacity ? `\\b${capacity[1]}\\s*${capacity[2]}\\b` : `\\b${term}\\b`, "i").test(title);
  })) return false;
  return true;
}

export function matchesRequiredIntent(item: SearchedProduct, query: ShopperQuery) {
  if (!matchesMandatoryAttributes(item.title, query)) return false;
  if (query.maxPrice != null && query.maxPriceIsHard && (item.price == null || item.price > query.maxPrice)) return false;
  if (query.minPrice != null && (item.price == null || item.price < query.minPrice)) return false;
  return true;
}
