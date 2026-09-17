import { afterEach, describe, expect, it, vi } from "vitest";
import { interpretShopperIntent } from "../services/shopperIntentService.js";
import { discoverProducts } from "../services/shopperDiscoveryService.js";
import { SerpApiProductSearchProvider, parseOrganicPrice, resolveStorePrice } from "../services/serpApiProductSearchProvider.js";

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
  it("uses alternate shopping queries when immersive candidates contain no usable offers", async () => {
    const query = interpretShopperIntent("panela tramontina 24cm", null);
    const requests: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input));
      const engine = url.searchParams.get("engine");
      const phrase = url.searchParams.get("q");
      requests.push(`${engine}:${phrase}`);
      if (engine === "google") return new Response(JSON.stringify({ immersive_products: [{ title: "Panela genérica", immersive_product_page_token: "empty-token" }] }), { status: 200 });
      if (engine === "google_immersive_product") return new Response(JSON.stringify({ product_results: { title: "Panela genérica", stores: [] } }), { status: 200 });
      if (phrase === query.query) return new Response(JSON.stringify({ error: "No results" }), { status: 200 });
      return new Response(JSON.stringify({ shopping_results: [{ title: "Panela Tramontina 24cm", link: "https://shop.example/pan", source: "Loja", extracted_price: 120 }] }), { status: 200 });
    });
    const provider = new SerpApiProductSearchProvider();
    vi.spyOn(provider, "available").mockReturnValue(true);
    const result = await discoverProducts(query, provider);
    expect(result.results).toEqual(expect.arrayContaining([expect.objectContaining({ title: "Panela Tramontina 24cm", price: 120 })]));
    expect(requests.some((request) => request.startsWith("google_shopping_light:") && request !== `google_shopping_light:${query.query}`)).toBe(true);
  });

  it("turns Google's immersive products into distinct merchant offers and uses the full installment price", async () => {
    const query = interpretShopperIntent("panela tramontina 24cm", null);
    const requests: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input));
      const engine = url.searchParams.get("engine") || "";
      requests.push(engine);
      if (engine === "google") return new Response(JSON.stringify({
        immersive_products: [{ title: "Panela Tramontina 24 cm", extracted_price: 100, immersive_product_page_token: "product-token" }],
        organic_results: [{ title: "Panela Tramontina 24 cm", link: "https://example.com/organic", source: "Loja A", rich_snippet: { top: { detected_extensions: { price: 100, currency: "R$" } } } }],
      }), { status: 200 });
      if (engine === "google_immersive_product") return new Response(JSON.stringify({ product_results: {
        title: "Panela Tramontina 24 cm", stores: [
          { title: "Panela Tramontina 24 cm", name: "Loja A", link: "https://shop-a.example/pan", extracted_price: 10, installments_description: "10x de R$ 10", extracted_total: 100 },
          { title: "Panela Tramontina 24 cm", name: "Loja B", link: "https://shop-b.example/pan", extracted_price: 120 },
        ],
      } }), { status: 200 });
      return new Response(JSON.stringify({ error: "Google hasn't returned any results for this query." }), { status: 200 });
    });
    const provider = new SerpApiProductSearchProvider();
    vi.spyOn(provider, "available").mockReturnValue(true);
    const result = await discoverProducts(query, provider);
    expect(requests).toContain("google_immersive_product");
    expect(result.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ store: "Loja A", price: 100 }),
      expect.objectContaining({ store: "Loja B", price: 120 }),
    ]));
    expect(result.variations.some((variation) => variation.offers.length >= 2)).toBe(true);
    expect(result.metrics.sources.google.immersiveProducts).toBe(1);
  });

  it("keeps a priced organic Google result and does not treat it as missing a price", async () => {
    const query = interpretShopperIntent("kit shampoo e condicionador wella 1l invigo", null);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const engine = new URL(String(input)).searchParams.get("engine") || "";
      if (engine === "google") return new Response(JSON.stringify({
        organic_results: [{
          title: "Kit Shampoo e Condicionador Wella Invigo 1L",
          link: "https://shop.example/wella",
          source: "Loja A",
          snippet: "Kit shampoo e condicionador Wella Invigo 1L",
          rich_snippet: { top: { detected_extensions: { price: 263.84, currency: "BRL" } } },
        }],
      }), { status: 200 });
      return new Response(JSON.stringify({ error: "Google hasn't returned any results for this query." }), { status: 200 });
    });
    const provider = new SerpApiProductSearchProvider();
    vi.spyOn(provider, "available").mockReturnValue(true);
    const result = await discoverProducts(query, provider);
    expect(result.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ store: "Loja A", price: 263.84, reason: expect.not.stringMatching(/preço não informado/i) }),
    ]));
    expect(result.metrics.sources.google.pricedOffers).toBe(1);
  });

  it("does not drop a valid offer just because another title also mentions an extra query adjective", async () => {
    const query = interpretShopperIntent("crocs feminino preto tamanho 36", null);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const engine = new URL(String(input)).searchParams.get("engine") || "";
      if (engine === "google") return new Response(JSON.stringify({
        immersive_products: [{ title: "Crocs Classic Clog Preto 36", immersive_product_page_token: "crocs-token" }],
      }), { status: 200 });
      if (engine === "google_immersive_product") return new Response(JSON.stringify({ product_results: {
        title: "Crocs Classic Clog",
        stores: [
          { title: "Crocs Classic Clog Feminino Preto tamanho 36", name: "Loja A", link: "https://shop-a.example/crocs", extracted_price: 199 },
          { title: "Crocs Classic Clog Preto tamanho 36", name: "Loja B", link: "https://shop-b.example/crocs", extracted_price: 189 },
        ],
      } }), { status: 200 });
      return new Response(JSON.stringify({ error: "Google hasn't returned any results for this query." }), { status: 200 });
    });
    const provider = new SerpApiProductSearchProvider();
    vi.spyOn(provider, "available").mockReturnValue(true);
    const result = await discoverProducts(query, provider);
    expect(result.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ store: "Loja A", price: 199 }),
      expect.objectContaining({ store: "Loja B", price: 189 }),
    ]));
    expect(result.metrics.diagnostics.some((row) => row.stage === "ranking" && row.reason === "low_relevance" && /preto tamanho 36/i.test(String(row.title)))).toBe(false);
  });

  it("keeps distinct merchant prices as separate offers of the same product", async () => {
    const query = interpretShopperIntent("kit shampoo e condicionador wella 1l invigo", null);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const engine = new URL(String(input)).searchParams.get("engine") || "";
      if (engine === "google") return new Response(JSON.stringify({
        immersive_products: [{ title: "Kit Shampoo e Condicionador Wella Invigo 1L", immersive_product_page_token: "wella-token" }],
      }), { status: 200 });
      if (engine === "google_immersive_product") return new Response(JSON.stringify({ product_results: {
        title: "Kit Shampoo e Condicionador Wella Invigo 1L",
        stores: [
          { title: "Kit Shampoo e Condicionador Wella Invigo 1L", name: "Loja A", link: "https://a.example/1", extracted_price: 263.84 },
          { title: "Kit Shampoo e Condicionador Wella Invigo 1L", name: "Loja A", link: "https://a.example/2", extracted_price: 275.91 },
          { title: "Kit Shampoo e Condicionador Wella Invigo 1L", name: "Loja B", link: "https://b.example/1", extracted_price: 319.91 },
        ],
      } }), { status: 200 });
      return new Response(JSON.stringify({ error: "Google hasn't returned any results for this query." }), { status: 200 });
    });
    const provider = new SerpApiProductSearchProvider();
    vi.spyOn(provider, "available").mockReturnValue(true);
    const result = await discoverProducts(query, provider);
    expect(result.results).toHaveLength(3);
    expect(result.variations).toHaveLength(1);
    expect(result.variations[0].offers.map((offer) => offer.price).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([263.84, 275.91, 319.91]);
  });

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

describe("generic recovery parsers", () => {
  it("reads structured organic prices without requiring the R$ symbol", () => {
    expect(parseOrganicPrice({ rich_snippet: { top: { detected_extensions: { price: 263.84, currency: "BRL" } } } })).toBe(263.84);
    expect(parseOrganicPrice({ rich_snippet: { bottom: { detected_extensions: { price: "R$ 319,91", currency: "R$" } } } })).toBe(319.91);
    expect(parseOrganicPrice({ snippet: "Oferta por R$ 300,93 no site" })).toBeNull();
    expect(parseOrganicPrice({ snippet: "Modelo 36, agora R$ 299,00" })).toBeNull();
    expect(parseOrganicPrice({ snippet: "Notebook 10x R$359,90; R$3.599", extensions: [] })).toBeNull();
    expect(parseOrganicPrice({ rich_snippet: { bottom: { detected_extensions: { price: 18573, currency: "R$" }, extensions: ["R$ 185,73", "Em estoque"] } } })).toBe(185.73);
  });

  it("uses the product total instead of an installment amount", () => {
    expect(resolveStorePrice({ extracted_price: 10, installments_description: "10x de R$ 10", extracted_total: 100 })).toBe(100);
    expect(resolveStorePrice({ extracted_price: 10, details_and_offers: ["10x de R$ 10,00"] })).toBe(100);
    expect(resolveStorePrice({ extracted_price: 120 })).toBe(120);
    expect(resolveStorePrice({ extracted_price: 6.97, extracted_total: 13.96, shipping_extracted: 6.99 })).toBe(6.97);
  });
});
