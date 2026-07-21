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

export const DEPARTMENTS = [
  { value: "moda", label: "Moda" },
  { value: "achadinhos", label: "Achadinhos" },
] as const;

export const PRIORITIES = ["Quero muito", "Quero", "Talvez"] as const;
export const STATUSES = [
  "Quero comprar",
  "Esperando promoÃ§Ã£o",
  "JÃ¡ comprei",
  "Desisti da compra",
] as const;

export const PRICE_BANDS = [
  { value: "", label: "Todas as faixas" },
  { value: "ate-50", label: "AtÃ© R$ 50" },
  { value: "50-100", label: "De R$ 50 a R$ 100" },
  { value: "100-200", label: "De R$ 100 a R$ 200" },
  { value: "200-300", label: "De R$ 200 a R$ 300" },
  { value: "300-500", label: "De R$ 300 a R$ 500" },
  { value: "500-1000", label: "De R$ 500 a R$ 1.000" },
  { value: "acima-1000", label: "Acima de R$ 1.000" },
] as const;

export function departmentFromCategory(category?: string | null) {
  return NON_FASHION_CATEGORIES.includes(
    category as (typeof NON_FASHION_CATEGORIES)[number],
  )
    ? "achadinhos"
    : "moda";
}

export type ProductImage = {
  id: string;
  imageUrl: string;
  imagePublicId: string;
  position: number;
  isMain: boolean;
};

export type Product = {
  id: string;
  name: string;
  category: string;
  brand: string;
  brandId: string;
  brandSlug: string;
  store: string;
  originalPrice: number;
  promotionalPrice: number | null;
  shippingPrice: number | null;
  effectiveShippingPrice?: number | null;
  shippingInherited?: boolean;
  purchaseUrl?: string | null;
  imageUrl?: string | null;
  images?: ProductImage[];
  color?: string | null;
  size?: string | null;
  priority: string;
  status: string;
  notes?: string | null;
  isFavorite?: boolean;
  purchasedPrice?: number | null;
  purchasedAt?: string | null;
  effectivePrice: number;
  discountPercent: number;
  hasPromo: boolean;
};

export type BrandSummary = {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  productCount: number;
  categories: string[];
  allCategories: string[];
  minPrice: number;
  maxPrice: number;
  totalValue: number;
  products: Product[];
};

export type User = { id: string; name: string; email: string };

export type Summary = {
  wantCount: number;
  boughtCount: number;
  waitingCount: number;
  wishTotal: number;
  spentTotal: number;
  savedTotal: number;
  counts: Record<string, number>;
};

export type PromoRadarStatus =
  | "ok"
  | "page_unavailable"
  | "access_blocked"
  | "product_mismatch"
  | "price_not_found"
  | "out_of_stock"
  | "analysis_failed";

export type PromoRadarAvailability =
  | "in_stock"
  | "out_of_stock"
  | "preorder"
  | "unknown";

export type PromoRadarConditionalOffer = {
  type: "pix" | "coupon" | "payment_method";
  price: number;
  label: string;
  condition: string;
};

export type PromoRadarProduct = {
  productId: string;
  productName: string;
  productBrand: string;
  imageUrl: string | null;
  purchaseUrl: string | null;
  normalizedPurchaseUrl: string | null;
  finalUrl: string | null;
  productMatched: boolean;
  matchConfidence: number;
  isOnSale: boolean;
  autoDisplayEligible: boolean;
  originalPrice: number | null;
  salePrice: number | null;
  discountPercentage: number | null;
  pixPrice: number | null;
  currency: string;
  availability: PromoRadarAvailability;
  variationAnalyzed: string | null;
  evidence: string[];
  status: PromoRadarStatus;
  reason: string | null;
  checkedAt: string;
  logs: string[];
  conditionalOffers: PromoRadarConditionalOffer[];
  pageTitle: string | null;
  matchedFieldScores: Partial<
    Record<"name" | "brand" | "category" | "color" | "size" | "sku" | "image", number>
  >;
};

export type PromoRadarBrand = {
  brandId: string;
  brand: string;
  storeDomain: string;
  headline: string;
  detectedAt: string;
  campaignUrls: string[];
  matchedProducts: PromoRadarProduct[];
};

export type PromoRadarResponse = {
  generatedAt: string;
  products: PromoRadarProduct[];
  brands: PromoRadarBrand[];
};

export type ProductQuery = {
  search?: string;
  department?: "moda" | "achadinhos" | "";
  category?: string;
  brand?: string;
  brandSlug?: string;
  store?: string;
  color?: string;
  size?: string;
  priority?: string;
  status?: string;
  favorite?: boolean;
  promo?: string;
  minPrice?: string;
  maxPrice?: string;
  priceBand?: string;
  sort?: string;
  page?: number;
  perPage?: number;
};

export function formatBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function mediaUrl(url?: string | null) {
  if (!url) return "";
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  const api = import.meta.env.VITE_API_URL || "http://localhost:3334/api";
  const origin = String(api).replace(/\/api\/?$/, "");
  return `${origin}${url.startsWith("/") ? url : `/${url}`}`;
}
