import { describe, expect, it } from "vitest";
import { evaluateProductMatch, interpretShopperIntent, matchesQueryAttributes, matchesRequiredIntent, normalizeShopperText, compatibleProductIntent } from "../services/shopperIntentService.js";
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
    expect(normalizeShopperText("5 litros")).toBe("5000ml");
    expect(normalizeShopperText("24 cm")).toBe("24cm");
    expect(normalizeShopperText("256GB")).toBe("256gb");
    expect(normalizeShopperText("tamanho 36")).toBe("tamanho 36");
    expect(normalizeShopperText("1000ml")).toBe("1000ml");
    expect(evaluateProductMatch("Kit 1000ml", interpretShopperIntent("kit 1l", null)).eligible).toBe(true);
    expect(evaluateProductMatch("Air Fryer 5L", interpretShopperIntent("air fryer 5 litros", null)).eligible).toBe(true);
    expect(evaluateProductMatch("Notebook 16GB 256GB", interpretShopperIntent("notebook 16gb 256gb", null)).eligible).toBe(true);
  });

  it("keeps a candidate that matches query attributes even when another title is more complete", () => {
    const query = interpretShopperIntent("crocs feminino preto tamanho 36", null);
    const complete = "Crocs Classic Clog Feminino Preto tamanho 36";
    const withoutGender = "Crocs Classic Clog Preto tamanho 36";
    expect(matchesQueryAttributes(complete, query).eligible).toBe(true);
    expect(matchesQueryAttributes(withoutGender, query).eligible).toBe(true);
    expect(matchesQueryAttributes(withoutGender, query).coverage).toBeGreaterThanOrEqual(.7);
    expect(matchesQueryAttributes("Crocs Classic Clog Rosa tamanho 37", query).eligible).toBe(false);
  });
  it("keeps an unstated measurement as unknown at final ranking without accepting a contradiction", () => {
    for (const [request, unknown, conflict] of [
      ["panela tramontina antiaderente 24cm", "Panela Tramontina antiaderente", "Panela Tramontina antiaderente 20cm"],
      ["notebook lenovo i5 16gb", "Notebook Lenovo i5", "Notebook Lenovo i5 8GB"],
      ["ração golden gatos castrados 10kg", "Ração Golden gatos castrados", "Ração Golden gatos castrados 500g"],
    ]) {
      const query = interpretShopperIntent(request, null);
      expect(matchesQueryAttributes(unknown, query).eligible).toBe(true);
      expect(matchesRequiredIntent(item(unknown), query)).toBe(true);
      expect(matchesRequiredIntent(item(conflict), query)).toBe(false);
    }
  });

  it("rejects an explicit competing color without requiring every offer to state a color", () => {
    const query = interpretShopperIntent("sandália feminina preta tamanho 36", null);
    expect(matchesRequiredIntent(item("Sandália feminina branca tamanho 36"), query)).toBe(false);
    expect(matchesRequiredIntent(item("Sandália feminina azul tamanho 36"), query)).toBe(false);
    expect(matchesRequiredIntent(item("Sandália feminina rosa tamanho 36"), query)).toBe(false);
    expect(evaluateProductMatch("Sandália feminina branca tamanho 36", query).reason).toBe("color_conflict");
    expect(matchesRequiredIntent(item("Sandália feminina tamanho 36"), query)).toBe(true);
    expect(matchesRequiredIntent(item("Sandália feminina preta tamanho 36"), query)).toBe(true);
  });

  it("uses the seller title to detect quantity conflicts hidden by a matching product title", () => {
    const query = interpretShopperIntent("ração gatos 10kg", null);
    const conflicting = { ...item("Ração gatos 500g"), productTitle: "Ração gatos 10kg", attributesText: "Ração gatos 10kg" };
    const equivalent = { ...item("Ração gatos 10000g"), productTitle: "Ração gatos 10kg" };
    const unknown = { ...item("Ração gatos"), productTitle: "Ração gatos 10kg" };
    expect(matchesRequiredIntent(conflicting, query)).toBe(false);
    expect(matchesRequiredIntent(equivalent, query)).toBe(true);
    expect(matchesRequiredIntent(unknown, query)).toBe(true);
  });

  it("rejects an explicitly conflicting gender while allowing an unknown or unisex attribute", () => {
    const query = interpretShopperIntent("calçado feminino tamanho 36", null);
    expect(matchesRequiredIntent(item("Calçado masculino tamanho 36"), query)).toBe(false);
    expect(evaluateProductMatch("Calçado masculino tamanho 36", query).reason).toBe("gender_conflict");
    expect(matchesRequiredIntent(item("Calçado tamanho 36"), query)).toBe(true);
    expect(matchesRequiredIntent(item("Calçado unissex tamanho 36"), query)).toBe(true);
  });

  it("recognizes uncommon colors and labeled color shades without treating unlabeled flavor words as colors", () => {
    const black = interpretShopperIntent("calçado preto tamanho 36", null);
    expect(evaluateProductMatch("Calçado turquesa tamanho 36", black).reason).toBe("color_conflict");
    expect(evaluateProductMatch("Calçado bordô tamanho 36", black).reason).toBe("color_conflict");
    expect(evaluateProductMatch("Calçado multicores salmão tamanho 36", black).reason).toBe("color_conflict");
    expect(evaluateProductMatch("Calçado cor lavanda tamanho 36", black).reason).toBe("color_conflict");
    expect(evaluateProductMatch("Calçado tamanho 36", black).eligible).toBe(true);
    expect(evaluateProductMatch("Calçado preto e branco tamanho 36", black).eligible).toBe(true);
    const food = interpretShopperIntent("ração salmão 10kg", null);
    expect(evaluateProductMatch("Ração salmão embalagem azul 10kg", food).eligible).toBe(true);
  });

  it("does not confirm a requested entity from an explicit style or compatibility claim", () => {
    const query = interpretShopperIntent("notebook lenovo i5 16gb", null);
    for (const title of ["Notebook estilo Lenovo i5 16GB", "Notebook tipo Lenovo i5 16GB", "Notebook similar a Lenovo i5 16GB", "Notebook inspirado em Lenovo i5 16GB", "Notebook compatível com Lenovo i5 16GB"]) {
      expect(evaluateProductMatch(title, query).reason).toBe("brand_similarity_conflict");
    }
    expect(evaluateProductMatch("Notebook i5 16GB", query).eligible).toBe(true);
    expect(evaluateProductMatch("Notebook Lenovo i5 16GB", query).eligible).toBe(true);
    const styleQuery = interpretShopperIntent("sapato estilo casual tamanho 36", null);
    expect(evaluateProductMatch("Sapato estilo casual tamanho 36", styleQuery).eligible).toBe(true);
  });

  it("treats equivalent product wording as compatible intent and rejects a real product contradiction", () => {
    const kit = interpretShopperIntent("kit shampoo condicionador Wella Invigo 1L", null);
    expect(compatibleProductIntent(kit, interpretShopperIntent("kit Wella Invigo 1L até 298 reais", null))).toBe(true);
    expect(compatibleProductIntent(kit, interpretShopperIntent("Wella Invigo shampoo e condicionador até 250", null))).toBe(true);
    expect(compatibleProductIntent(kit, interpretShopperIntent("notebook lenovo i5 16gb", null))).toBe(false);
    expect(compatibleProductIntent(interpretShopperIntent("notebook lenovo 16gb", null), interpretShopperIntent("notebook lenovo 8gb", null))).toBe(false);
    expect(compatibleProductIntent(interpretShopperIntent("crocs feminino preto tamanho 36", null), interpretShopperIntent("crocs feminino preto tamanho 37", null))).toBe(false);
  });
});
