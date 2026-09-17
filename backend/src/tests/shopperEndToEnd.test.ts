import { afterEach, describe, expect, it, vi } from "vitest";
import { interpretShopperIntent } from "../services/shopperIntentService.js";
import { discoverProducts } from "../services/shopperDiscoveryService.js";
import { SerpApiProductSearchProvider } from "../services/serpApiProductSearchProvider.js";

afterEach(() => vi.restoreAllMocks());

const cases = [
  { query: "crocs feminino preto tamanho 36", good: "Crocs feminino preto tam. 36", wrong: "Crocs feminino preto tam. 37", price: 199 },
  { query: "kit shampoo e condicionador wella 1l invigo", good: "Kit Shampoo e Condicionador Wella Invigo Nutri Enrich 1L", wrong: "Kit Wella Invigo Shampoo 1L e Máscara 1L", price: 339.9 },
  { query: "notebook lenovo i5 16gb", good: "Notebook Lenovo Intel i5 16 GB", wrong: "Notebook Lenovo Intel i5 8 GB", price: 3100 },
  { query: "perfume feminino 100ml até 400 reais", good: "Perfume feminino floral 100 ml", wrong: "Perfume feminino floral 100ml", price: 350, wrongPrice: 450 },
  { query: "ração golden gatos castrados 10kg", good: "Ração Golden gatos castrados 10 kg", wrong: "Ração Golden gatos castrados 1 kg", price: 169 },
  { query: "air fryer 5 litros", good: "Air Fryer 5L", wrong: "Air Fryer 4L", price: 299 },
];

describe("shopper search from natural query to final offers", () => {
  it("recovers priced results with a generic fallback when both exact shopping engines have no results", async () => {
    const query = interpretShopperIntent("crocs feminino preto tamanho 36", null);
    const requests: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input));
      const engine = url.searchParams.get("engine");
      const phrase = url.searchParams.get("q");
      requests.push(`${engine}:${phrase}`);
      if (engine === "google") return new Response(JSON.stringify({ organic_results: [] }), { status: 200 });
      if (phrase === query.query) return new Response(JSON.stringify({ error: "Google hasn't returned any results for this query." }), { status: 200 });
      return new Response(JSON.stringify({ shopping_results: [
        { title: "Crocs feminino preto 36", link: "https://example.com/right", source: "Loja independente", extracted_price: 190 },
        { title: "Crocs feminino preto 37", link: "https://example.com/wrong", source: "Loja independente", extracted_price: 180 },
      ] }), { status: 200 });
    });
    const provider = new SerpApiProductSearchProvider();
    vi.spyOn(provider, "available").mockReturnValue(true);
    const result = await discoverProducts(query, provider);
    expect(requests).toContain("google_shopping_light:crocs feminino preto 36");
    expect(result.results.map((offer) => offer.productUrl)).toEqual(["https://example.com/right"]);
    expect(result.metrics.sources.shopping.some((source) => source.status === "provider_error")).toBe(true);
  });

  it.each(cases)("returns the relevant final card for $query", async ({ query: message, good, wrong, price, wrongPrice }) => {
    const query = interpretShopperIntent(message, null);
    const requests: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input));
      requests.push(`${url.searchParams.get("engine")}:${url.searchParams.get("q")}`);
      if (url.searchParams.get("engine") === "google") return new Response(JSON.stringify({
        organic_results: [{ title: good, link: "https://example.com/organic", source: "Loja independente", snippet: good }],
      }), { status: 200 });
      return new Response(JSON.stringify({ shopping_results: [
        { title: good, link: "https://example.com/good", source: "Loja independente", extracted_price: price, thumbnail: "https://example.com/good.jpg" },
        { title: wrong, link: "https://example.com/wrong", source: "Outra loja", extracted_price: wrongPrice ?? price, thumbnail: "https://example.com/wrong.jpg" },
      ] }), { status: 200 });
    });
    const provider = new SerpApiProductSearchProvider();
    vi.spyOn(provider, "available").mockReturnValue(true);
    const result = await discoverProducts(query, provider);
    expect(requests).toContain(`google:${query.query}`);
    expect(requests).toContain(`google_shopping:${query.query}`);
    expect(result.variations.length).toBeGreaterThan(0);
    expect(result.results[0]).toMatchObject({ title: good, price, store: "Loja independente" });
    expect(result.results.some((offer) => offer.productUrl === "https://example.com/good")).toBe(true);
    expect(result.results.some((offer) => offer.productUrl === "https://example.com/wrong")).toBe(false);
    expect(result.metrics.sources.google.status).toBe("organic_only");
  });
});
