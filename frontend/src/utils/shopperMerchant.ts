export const shopperMerchants = ["Mercado Livre", "Shopee", "Amazon", "Magalu"] as const;
export type ShopperMerchant = string;

export function normalizeShopperMerchant(store: string | null | undefined): ShopperMerchant {
  const value = (store || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (/\bamazon\b/.test(value)) return "Amazon";
  if (/\bmercado\s*livre\b|\bmercadolivre\b/.test(value)) return "Mercado Livre";
  if (/\bshopee\b/.test(value)) return "Shopee";
  if (/\bmagalu\b|\bmagazine\s*luiza\b/.test(value)) return "Magalu";
  return (store || "Loja não informada").trim();
}
