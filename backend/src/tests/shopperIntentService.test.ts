import { describe, expect, it } from "vitest";
import { evaluateProductMatch, interpretShopperIntent, matchesRequiredIntent, normalizeShopperText } from "../services/shopperIntentService.js";
import type { SearchedProduct } from "../services/productSearchProvider.js";

const item = (title: string, price = 200) => ({ title, price } as SearchedProduct);

describe("generic shopper intent", () => {
  it("keeps the natural query and budget, refines a conversation, and resets for a new product", () => {
    const first = interpretShopperIntent("kit shampoo e condicionador wella 1l invigo", null);
    expect(first.query).toBe("kit shampoo e condicionador wella 1l invigo");
    expect(first.requiredBrands).toEqual([]);
    const budget = interpretShopperIntent("até R$ 400", first);
    expect(budget.query).toBe(first.query);
    expect(budget.maxPrice).toBe(400);
    const refined = interpretShopperIntent("prefiro nutri enrich", budget);
    expect(refined.query).toContain("nutri enrich");
    const next = interpretShopperIntent("agora quero crocs feminino preto tamanho 36", refined);
    expect(next.query).toBe("crocs feminino preto tamanho 36");
    expect(next.maxPrice).toBeNull();
  });

  it.each([
    ["crocs feminino preto tamanho 36", "Crocs feminino preto tam. 36"],
    ["kit shampoo e condicionador wella 1l invigo", "Kit Wella Invigo SH 1000ml + Cond 1L"],
    ["notebook lenovo i5 16gb", "Lenovo Notebook 16 GB Intel i5"],
    ["perfume feminino 100ml até 400 reais", "Perfume feminino floral 100 ml"],
    ["ração golden gatos castrados 10kg", "Ração Golden 10 kg para gatos castrados"],
    ["air fryer 5 litros", "Fritadeira Air Fryer 5L"],
    ["tênis nike feminino 36 branco", "Nike Tênis Branco Feminino 36"],
  ])("matches reordered or abbreviated wording for %s", (message, title) => {
    const query = interpretShopperIntent(message, null);
    expect(matchesRequiredIntent(item(title), query)).toBe(true);
    expect(evaluateProductMatch(title, query).confidence).toBeGreaterThanOrEqual(75);
  });

  it("rejects explicit contradictions without catalog-specific rules", () => {
    const shoe = interpretShopperIntent("crocs feminino preto tamanho 36", null);
    expect(matchesRequiredIntent(item("Crocs feminino preto tamanho 37"), shoe)).toBe(false);
    const notebook = interpretShopperIntent("notebook lenovo i5 16gb", null);
    expect(matchesRequiredIntent(item("Lenovo notebook i5 8GB"), notebook)).toBe(false);
    const pet = interpretShopperIntent("ração golden gatos castrados 10kg", null);
    expect(matchesRequiredIntent(item("Ração Golden gatos castrados 1kg"), pet)).toBe(false);
    const appliance = interpretShopperIntent("air fryer 5 litros", null);
    expect(matchesRequiredIntent(item("Air Fryer 4L"), appliance)).toBe(false);
    const perfume = interpretShopperIntent("perfume feminino 100ml até 400 reais", null);
    expect(perfume.query).toBe("perfume feminino 100ml");
    expect(matchesRequiredIntent(item("Perfume feminino 100ml", 450), perfume)).toBe(false);
    const pair = interpretShopperIntent("kit shampoo e condicionador wella 1l invigo", null);
    expect(matchesRequiredIntent(item("Kit Wella Invigo shampoo 1L + máscara 1L"), pair)).toBe(false);
  });

  it("normalizes units independently of product category", () => {
    expect(normalizeShopperText("1L 10kg 16 GB 100 ml")).toBe("1000ml 10000g 16gb 100ml");
  });
});
