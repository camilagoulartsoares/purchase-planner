export function slugify(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "marca"
  );
}

export const FASHION_CATEGORIES = [
  "Vestidos",
  "Blusas",
  "Camisas",
  "CalÃ§as",
  "Saias",
  "Shorts",
  "Conjuntos",
  "Casacos",
  "Tops e corsets",
  "Bodies",
  "Moda fitness",
  "Moda praia",
  "CalÃ§ados",
  "Bolsas",
  "AcessÃ³rios",
  "Outros",
] as const;

export const NON_FASHION_CATEGORIES = [
  "Beleza",
  "Casa e decor",
  "Tecnologia",
  "Organizacao",
  "Papelaria",
  "Bem-estar",
  "Pets",
  "Outros achados",
] as const;

export const CATEGORIES = [
  ...FASHION_CATEGORIES,
  ...NON_FASHION_CATEGORIES,
] as const;

export const DEPARTMENTS = ["moda", "achadinhos"] as const;

/** Categories shown as brand-page filters (only those with products appear). */
export const BRAND_FILTER_CATEGORIES = [
  "CalÃ§as",
  "Vestidos",
  "Blusas",
  "Tops e corsets",
  "Bodies",
  "Saias",
  "Shorts",
  "Conjuntos",
  "Casacos",
  "CalÃ§ados",
  "Bolsas",
  "AcessÃ³rios",
] as const;

export const PRIORITIES = ["Quero muito", "Quero", "Talvez"] as const;

export const STATUSES = [
  "Quero comprar",
  "Esperando promoÃ§Ã£o",
  "JÃ¡ comprei",
  "Desisti da compra",
] as const;

export function categoryDepartment(category?: string | null) {
  return NON_FASHION_CATEGORIES.includes(category as (typeof NON_FASHION_CATEGORIES)[number])
    ? "achadinhos"
    : "moda";
}

export function departmentCategories(department?: string | null) {
  if (department === "achadinhos") return [...NON_FASHION_CATEGORIES];
  if (department === "moda") return [...FASHION_CATEGORIES];
  return [...CATEGORIES];
}

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
    const raw = value.replace(/[R$\s]/g, "");
    const comma = raw.lastIndexOf(",");
    const dot = raw.lastIndexOf(".");
    const decimalSeparator = comma > dot ? "," : dot > -1 ? "." : "";
    const cleaned = decimalSeparator
      ? `${raw
          .slice(0, raw.lastIndexOf(decimalSeparator))
          .replace(/[.,]/g, "")}.${raw.slice(raw.lastIndexOf(decimalSeparator) + 1)}`
      : raw.replace(/[.,]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

export function effectivePrice(
  originalPrice: number,
  promotionalPrice: number | null | undefined,
  shippingPrice?: number | null,
) {
  const shipping =
    shippingPrice != null && Number.isFinite(shippingPrice) && shippingPrice > 0
      ? shippingPrice
      : 0;
  if (
    promotionalPrice != null &&
    Number.isFinite(promotionalPrice) &&
    promotionalPrice > 0 &&
    promotionalPrice < originalPrice
  ) {
    return promotionalPrice + shipping;
  }
  return originalPrice + shipping;
}
