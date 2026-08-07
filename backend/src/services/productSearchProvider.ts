export type ShopperQuery = {
  query: string;
  category: string | null;
  maxPrice: number | null;
  maxPriceIsHard: boolean;
  currency: "BRL";
  colors: string[];
  size: string | null;
  brands: string[];
  usage: string | null;
  style: string[];
  exclude: string[];
  originalOnly: boolean;
  sortPreference: "best_match" | "lowest_price" | "best_rated";
};

export type SearchedProduct = {
  id: string;
  provider: string;
  title: string;
  price: number | null;
  previousPrice: number | null;
  currency: "BRL";
  store: string | null;
  brand: string | null;
  imageUrl: string | null;
  productUrl: string;
  rating: number | null;
  reviewCount: number | null;
  shipping: string | null;
  availability: string | null;
  discountPercent: number | null;
  match: { query: number; budget: number; style: number; completeness: number; total: number };
  reason: string;
};

export interface ProductSearchProvider {
  readonly id: string;
  available(): boolean;
  search(query: ShopperQuery): Promise<SearchedProduct[]>;
}
