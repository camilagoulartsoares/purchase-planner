import { describe, expect, it } from "vitest";
import { normalizeShopperMerchant, preferredMerchants } from "../services/shopperMerchantService.js";

describe("shopper merchants", () => {
  it("normalizes only equivalent preferred merchant names", () => {
    expect(normalizeShopperMerchant("Amazon.com.br - Seller")).toBe("Amazon");
    expect(normalizeShopperMerchant("MercadoLivre")).toBe("Mercado Livre");
    expect(normalizeShopperMerchant("Magazine Luiza - Magalu")).toBe("Magalu");
    expect(normalizeShopperMerchant("Época Cosméticos")).toBe("Época Cosméticos");
  });
  it("keeps preferred stores as ranking hints, not an allow-list", () => expect(preferredMerchants).toEqual(["Mercado Livre", "Shopee", "Amazon", "Magalu"]));
});
