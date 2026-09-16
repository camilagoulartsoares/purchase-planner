export const preferredMerchants = ["Mercado Livre", "Shopee", "Amazon", "Magalu"] as const;
export type ShopperMerchant = string;

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Canonical labels for filtering; the original store name remains available for display. */
export function normalizeShopperMerchant(store: string | null | undefined): ShopperMerchant {
  const value = normalize(store || "");
  if (/\bamazon\b/.test(value)) return "Amazon";
  if (/\bmercado\s*livre\b|\bmercadolivre\b/.test(value)) return "Mercado Livre";
  if (/\bshopee\b/.test(value)) return "Shopee";
  if (/\bmagalu\b|\bmagazine\s*luiza\b/.test(value)) return "Magalu";
  return (store || "Loja não informada").trim();
}
