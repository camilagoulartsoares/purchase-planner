export const CATEGORIES = [
  "Vestidos",
  "Blusas",
  "Camisas",
  "Calças",
  "Saias",
  "Shorts",
  "Conjuntos",
  "Casacos",
  "Moda fitness",
  "Moda praia",
  "Calçados",
  "Bolsas",
  "Acessórios",
  "Outros",
] as const;

export const PRIORITIES = ["Quero muito", "Quero", "Talvez"] as const;

export const STATUSES = [
  "Quero comprar",
  "Esperando promoção",
  "Já comprei",
  "Desisti da compra",
] as const;

export function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[R$\s.]/g, "").replace(",", ".");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

export function effectivePrice(
  originalPrice: number,
  promotionalPrice: number | null | undefined,
) {
  if (
    promotionalPrice != null &&
    Number.isFinite(promotionalPrice) &&
    promotionalPrice > 0 &&
    promotionalPrice < originalPrice
  ) {
    return promotionalPrice;
  }
  return originalPrice;
}
