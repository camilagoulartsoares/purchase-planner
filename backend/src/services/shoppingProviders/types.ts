export type ShoppingOffer = {
  store: string;
  title: string;
  price: number;
  shipping: number | null;
  totalPrice: number | null;
  originalPrice: number | null;
  discountPercentage: number | null;
  url: string;
  imageUrl: string | null;
  seller: string | null;
  availability: string;
};

export type ShoppingProvider = {
  id: string;
  status: "operational" | "awaiting_integration";
  search(searchTerm: string, postalCode: string): Promise<ShoppingOffer[]>;
};
