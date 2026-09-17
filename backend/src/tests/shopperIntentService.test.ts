import { describe, expect, it } from "vitest";
import { interpretShopperIntent, matchesRequiredIntent } from "../services/shopperIntentService.js";
import { expandQueries } from "../services/shopperDiscoveryService.js";
import type { SearchedProduct } from "../services/productSearchProvider.js";

const item = (title: string, price = 200) => ({ title, price } as SearchedProduct);

describe("Personal Shopper intent and mandatory constraints", () => {
  it("refina a mesma conversa e reinicia quando o produto muda", () => {
    const first = interpretShopperIntent("kit shampoo Wella", null);
    const budget = interpretShopperIntent("kit shampoo Wella até R$398", first);
    const line = interpretShopperIntent("só da linha Fusion", budget);
    const alternative = interpretShopperIntent("pode ser shampoo + máscara também", line);
    const reset = interpretShopperIntent("agora quero protetor solar até R$100", alternative);
    expect(first.requiredBrands).toEqual(["Wella"]);
    expect(first.query).toBe("kit shampoo Wella");
    expect(budget.query).toBe("kit shampoo Wella");
    expect(budget.maxPrice).toBe(398);
    expect(budget.maxPriceIsHard).toBe(true);
    expect(line.requiredLine).toBe("Fusion");
    expect(line.query).toBe("kit shampoo Wella Fusion");
    expect(interpretShopperIntent("prefiro Fusion", budget).requiredBrands).toEqual(["Wella"]);
    expect(interpretShopperIntent("kit shampoo Wella até R$398", budget)).toEqual(budget);
    expect(alternative.requiredComponents).toContainEqual(["shampoo", "mascara"]);
    expect(expandQueries(alternative).some((value) => /mascara|máscara/i.test(value))).toBe(true);
    expect(reset.query).toBe("protetor solar");
    expect(reset.requiredBrands).toEqual([]);
    expect(reset.requiredLine).toBeNull();
    expect(reset.maxPrice).toBe(100);
  });
  it("exclui marcas, linhas, composições, volumes e modelos incompatíveis", () => {
    const wella = interpretShopperIntent("kit shampoo e condicionador Wella 1L até 398 reais", null);
    expect(matchesRequiredIntent(item("Kit Wella Fusion Shampoo 1000ml + Condicionador 1L", 350), wella)).toBe(true);
    expect(matchesRequiredIntent(item("Kit Dove Shampoo 1L + Condicionador 1L", 100), wella)).toBe(false);
    expect(matchesRequiredIntent(item("Kit Wella Shampoo 1L + Máscara 500ml", 100), wella)).toBe(false);
    expect(matchesRequiredIntent(item("Kit Wella Shampoo 250ml + Condicionador 200ml", 100), wella)).toBe(false);
    expect(matchesRequiredIntent(item("Kit Wella Shampoo 1L + Condicionador 1L", 450), wella)).toBe(false);
    const nike = interpretShopperIntent("Tênis Nike feminino até R$500", null);
    expect(matchesRequiredIntent(item("Tênis Adidas feminino", 300), nike)).toBe(false);
    const iphone = interpretShopperIntent("iPhone 16 256GB", null);
    expect(matchesRequiredIntent(item("Apple iPhone 16 128GB"), iphone)).toBe(false);
    expect(matchesRequiredIntent(item("Apple iPhone 16 256GB"), iphone)).toBe(true);
    const fusion = interpretShopperIntent("Shampoo Wella Fusion 1L", null);
    expect(matchesRequiredIntent(item("Wella Invigo Shampoo 1L"), fusion)).toBe(false);
  });
  it("exige o volume em cada componente de um kit, inclusive quando detalhes são a evidência", () => {
    const wella = interpretShopperIntent("kit shampoo e condicionador Wella 1L até R$340", null);
    expect(matchesRequiredIntent(item("Kit Wella Shampoo 1L + Condicionador 200ml", 249), wella)).toBe(false);
    expect(matchesRequiredIntent(item("Oferta de salão", 329) as SearchedProduct & { productTitle: string; attributesText: string }, wella)).toBe(false);
    const confirmed = { ...item("Oferta de salão", 329), productTitle: "Wella Invigo Nutri-Enrich Duo", attributesText: "kit shampoo 1000ml condicionador 1000ml" };
    expect(matchesRequiredIntent(confirmed, wella)).toBe(true);
  });
  it("encontra o kit Invigo pedido em minúsculas e reconhece Cond como condicionador", () => {
    const query = interpretShopperIntent("kit shampoo e condicionador wella 1l invigo", null);
    expect(query.requiredBrands).toEqual(["wella"]);
    expect(query.requiredLine).toBe("invigo");
    expect(matchesRequiredIntent(item("Kit Wella Invigo Nutri Enrich Shampoo 1000ml + Cond 1000ml", 339.9), query)).toBe(true);
    expect(matchesRequiredIntent(item("Kit Wella Fusion Shampoo 1000ml + Cond 1000ml", 300), query)).toBe(false);
  });
});
