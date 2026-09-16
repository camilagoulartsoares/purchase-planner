export type ShopperQuery = {
  query: string;
  category: string | null;
  maxPrice: number | null;
  minPrice?: number | null;
  maxPriceIsHard: boolean;
  currency: "BRL";
  colors: string[];
  size: string | null;
  brands: string[];
  requiredBrands?: string[];
  requiredLine?: string | null;
  requiredComponents?: string[][];
  requiredVolumes?: string[];
  /** Volumes that must be present for each named component, not merely somewhere in the title. */
  requiredComponentVolumes?: Record<string, string[]>;
  requiredModelTerms?: string[];
  requiredKit?: boolean;
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
  merchant?: string;
  brand: string | null;
  imageUrl: string | null;
  /** Other verified images returned for this exact Google Shopping product. */
  imageUrls?: string[];
  productUrl: string;
  rating: number | null;
  reviewCount: number | null;
  shipping: string | null;
  availability: string | null;
  discountPercent: number | null;
  match: { query: number; budget: number; style: number; completeness: number; total: number };
  reason: string;
  productId?: string | null;
  checkedAt?: string;
  sourceQuery?: string;
  sourcePosition?: number | null;
  productTitle?: string | null;
  attributesText?: string | null;
  imageSource?: "thumbnail" | "product-detail" | "offer" | null;
};

export type ShopperVariation = { id: string; title: string; imageUrl: string | null; imageSource?: string | null; offers: SearchedProduct[] };

export interface ProductSearchProvider {
  readonly id: string;
  available(): boolean;
  search(query: ShopperQuery): Promise<SearchedProduct[]>;
}
