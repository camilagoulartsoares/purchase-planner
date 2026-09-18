type AvailabilitySource = {
  availability?: unknown;
  in_stock?: unknown;
  out_of_stock?: unknown;
  stock?: unknown;
  details_and_offers?: unknown;
  buying_options?: unknown;
  extensions?: unknown;
};

function stockStatus(value: unknown): "out_of_stock" | "in_stock" | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().replace(/[_-]/g, " ");
  if (/(?:\bunavailable for (?:delivery|pickup)\b|\b(?:delivery|pickup) unavailable\b|\bindisponivel para (?:entrega|retirada)\b|\b(?:entrega|retirada) indisponivel\b)/.test(normalized)) return null;
  if (/(?:\bout of stock\b|\bsold out\b|\bunavailable\b|\bnot available\b|\bcurrently unavailable\b|\besgotad[oa]s?\b|\bindisponive(?:l|is)\b|\bsem estoque\b|\bfora de estoque\b)/.test(normalized)) return "out_of_stock";
  if (/(?:\bin stock\b|\bavailable\b|\bem estoque\b|\bdisponive(?:l|is)\b)/.test(normalized)) return "in_stock";
  return null;
}

export function availabilityFromSource(source: AvailabilitySource): "out_of_stock" | "in_stock" | null {
  const signals: Array<"out_of_stock" | "in_stock"> = [];
  if (source.out_of_stock === true || source.in_stock === false || source.stock === 0) signals.push("out_of_stock");
  if (source.out_of_stock === false || source.in_stock === true || (typeof source.stock === "number" && source.stock > 0)) signals.push("in_stock");
  const values = [source.availability, source.stock, source.details_and_offers, source.buying_options, source.extensions].flatMap((value) => Array.isArray(value) ? value : [value]);
  for (const value of values) {
    const status = stockStatus(value);
    if (status) signals.push(status);
  }
  // An explicit negative signal wins over an optimistic but possibly stale one.
  return signals.includes("out_of_stock") ? "out_of_stock" : signals.includes("in_stock") ? "in_stock" : null;
}

export function isExplicitlyUnavailable(value: string | null | undefined) {
  return availabilityFromSource({ availability: value }) === "out_of_stock";
}
