export const CATEGORIES = [
  "Vestidos","Blusas","Camisas","Calças","Saias","Shorts","Conjuntos","Casacos",
  "Moda fitness","Moda praia","Calçados","Bolsas","Acessórios","Outros",
] as const;

export const PRIORITIES = ["Quero muito", "Quero", "Talvez"] as const;
export const STATUSES = [
  "Quero comprar",
  "Esperando promoção",
  "Já comprei",
  "Desisti da compra",
] as const;

export type Product = {
  id: string;
  name: string;
  category: string;
  brand: string;
  store: string;
  originalPrice: number;
  promotionalPrice: number | null;
  purchaseUrl?: string | null;
  imageUrl?: string | null;
  color?: string | null;
  size?: string | null;
  priority: string;
  status: string;
  notes?: string | null;
  purchasedPrice?: number | null;
  purchasedAt?: string | null;
  effectivePrice: number;
  discountPercent: number;
  hasPromo: boolean;
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

export type ProductQuery = {
  search?: string;
  category?: string;
  brand?: string;
  store?: string;
  color?: string;
  size?: string;
  priority?: string;
  status?: string;
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
