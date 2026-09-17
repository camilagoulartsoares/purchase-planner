import { describe, expect, it } from "vitest";
import { normalizeShopperMerchant } from "../services/shopperMerchantService.js";

describe("shopper merchants", () => {
  it("keeps the seller supplied by any source", () => {
    expect(normalizeShopperMerchant("  Loja independente  ")).toBe("Loja independente");
    expect(normalizeShopperMerchant("MercadoLivre")).toBe("MercadoLivre");
    expect(normalizeShopperMerchant(null)).toBe("Loja não informada");
  });
});
