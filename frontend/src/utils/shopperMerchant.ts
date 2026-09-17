export type ShopperMerchant = string;

export function normalizeShopperMerchant(store: string | null | undefined): ShopperMerchant {
  return store?.trim() || "Loja não informada";
}
