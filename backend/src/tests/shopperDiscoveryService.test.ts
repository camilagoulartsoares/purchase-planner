import { describe, expect, it } from "vitest";
import { expandQueries, groupVariations } from "../services/shopperDiscoveryService.js";
import type { SearchedProduct, ShopperQuery } from "../services/productSearchProvider.js";

const query: ShopperQuery = { query: "kit shampoo Wella", category: null, maxPrice: null, maxPriceIsHard: false, currency: "BRL", colors: [], size: null, brands: ["Wella"], usage: null, style: [], exclude: [], originalOnly: false, sortPreference: "best_match" };
const offer = (title: string, url: string): SearchedProduct => ({ id: url, provider: "test", title, price: 100, previousPrice: null, currency: "BRL", store: "Loja", brand: null, imageUrl: null, productUrl: url, rating: null, reviewCount: null, shipping: null, availability: null, discountPercent: null, match: { query: 80, budget: 50, style: 50, completeness: 60, total: 70 }, reason: "", productId: "google-1" });

describe("shopper discovery", () => {
  it("expande sem depender de uma marca fixa e limita chamadas", () => {
    expect(expandQueries(query)).toContain("kit shampoo Wella");
    expect(expandQueries(query)).toContain("kit Wella");
    expect(expandQueries(query)).toContain("shampoo e condicionador Wella");
    expect(expandQueries({ ...query, query: "kit shampoo Lola", brands: ["Lola"] })).toContain("kit Lola");
    expect(expandQueries(query).length).toBeLessThanOrEqual(5);
  });
  it("agrupa a mesma composição, separa máscara de condicionador e volumes distintos", () => {
    const variations = groupVariations([
      offer("Wella Fusion Shampoo 1L + Condicionador 1L", "https://a.test/1"),
      offer("Kit Wella Fusion Shampoo 1000ml + Condicionador 1000ml", "https://b.test/2"),
      offer("Wella Fusion Shampoo 1L + Máscara 500ml", "https://c.test/3"),
      offer("Wella Fusion Shampoo 250ml + Condicionador 200ml", "https://d.test/4"),
      offer("Wella Fusion Shampoo 1L", "https://e.test/5"),
    ]);
    expect(variations).toHaveLength(4);
    expect(variations.some((item) => item.offers.length === 2)).toBe(true);
  });
  it("mantém a melhor oferta e reaproveita imagem válida somente da mesma composição", () => {
    const cheapest = { ...offer("Wella Fusion Shampoo 1L + Condicionador 1L", "https://a.test/cheap"), price: 299, imageUrl: null };
    const pictured = { ...offer("Kit Wella Fusion Shampoo 1000ml + Condicionador 1000ml", "https://b.test/photo"), price: 320, imageUrl: "https://images.test/wella.jpg", imageSource: "product-detail" as const };
    const differentVolume = { ...offer("Wella Fusion Shampoo 1L + Condicionador 200ml", "https://c.test/small"), imageUrl: "https://images.test/small.jpg" };
    const variations = groupVariations([cheapest, pictured, differentVolume]);
    const fullSize = variations.find((variation) => variation.offers.some((item) => item.id === cheapest.id))!;
    expect(fullSize.offers[0].id).toBe(cheapest.id);
    expect(fullSize.imageUrl).toBe("https://images.test/wella.jpg");
    expect(variations).toHaveLength(2);
  });
});
