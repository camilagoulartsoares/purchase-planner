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
  "Comprada",
  "Desisti da compra",
] as const;

export type Category = (typeof CATEGORIES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type Status = (typeof STATUSES)[number];

export type ClosetItem = {
  id: string;
  imageDataUrl?: string;
  imageUrl?: string;
  name: string;
  category: Category;
  brand: string;
  store: string;
  originalPrice: number;
  currentPrice: number;
  buyLink?: string;
  color: string;
  size: string;
  priority: Priority;
  status: Status;
  addedAt: string;
  notes?: string;
  paidPrice?: number;
  purchasedAt?: string;
  purchaseNotes?: string;
};

export type Budget = {
  monthlyLimit: number;
};

export type SortOption =
  | "menor-preco"
  | "maior-preco"
  | "maior-desconto"
  | "mais-desejados"
  | "recentes"
  | "antigos"
  | "nome"
  | "marca";

export type ViewMode = "cards" | "lista";

export type PriceBand =
  | ""
  | "ate-50"
  | "50-100"
  | "100-200"
  | "200-300"
  | "300-500"
  | "500-1000"
  | "acima-1000";

export type Filters = {
  category: string;
  brand: string;
  store: string;
  color: string;
  size: string;
  priority: string;
  status: string;
  promo: "" | "com" | "sem";
  priceBand: PriceBand;
  minPrice: string;
  maxPrice: string;
  search: string;
};

export const defaultFilters = (): Filters => ({
  category: "",
  brand: "",
  store: "",
  color: "",
  size: "",
  priority: "",
  status: "",
  promo: "",
  priceBand: "",
  minPrice: "",
  maxPrice: "",
  search: "",
});

export const STORAGE_ITEMS = "closet-sonhos-items-v1";
export const STORAGE_BUDGET = "closet-sonhos-budget-v1";
export const STORAGE_SEEDED = "closet-sonhos-seeded-v1";
