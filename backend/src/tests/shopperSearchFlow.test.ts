import { afterEach, describe, expect, it, vi } from "vitest";
import { interpretShopperIntent } from "../services/shopperIntentService.js";
import { SerpApiProductSearchProvider } from "../services/serpApiProductSearchProvider.js";
import { discoverProducts, selectDetailCandidates } from "../services/shopperDiscoveryService.js";
import type { SearchedProduct } from "../services/productSearchProvider.js";

afterEach(() => vi.restoreAllMocks());

describe("Personal Shopper search flow", () => {
  it("prioritizes compatible immersive cards by indicative budget and distinct leads without excluding expensive cards", () => {
    const query = interpretShopperIntent("panela tramontina 24cm até 200 reais", null);
    const card = (id: string, title: string, indicativePrice: number | null, indicativeStore = "Loja A") => ({ productId: id, token: id, title, relevance: 100, sourceQuery: query.query, sourcePosition: 1, imageUrls: [], indicativePrice, indicativeStore });
    const expensive = card("expensive", "Panela Tramontina 24cm", 230);
    const cheap = card("cheap", "Panela Tramontina 24cm", 180);
    const duplicate = card("duplicate", "Panela Tramontina 24cm", 180);
    const distinct = card("distinct", "Panela Tramontina 24cm com tampa", 180, "Loja B");
    const wrong = card("wrong", "Panela Tramontina 20cm", 150);
    const selected = selectDetailCandidates([expensive, duplicate, wrong, distinct, cheap], query, 5);
    expect(selected.map((item) => item.productId)).toEqual(["duplicate", "distinct", "cheap", "expensive", "wrong"]);
    expect(selectDetailCandidates([expensive], query, 1)).toEqual([expensive]);
    expect(selectDetailCandidates([wrong, duplicate], query, 1)).toEqual([duplicate]);
  });

  it("keeps remaining discovery budget available for extra details instead of reserving pagination", async () => {
    const query = interpretShopperIntent("notebook lenovo 16gb até 4000 reais", null);
    const provider = new SerpApiProductSearchProvider();
    provider.googleDetailCandidates = Array.from({ length: 12 }, (_, index) => ({ productId: `p${index}`, token: `p${index}`, title: index === 0 ? "Notebook Lenovo 8GB" : "Notebook Lenovo 16GB", relevance: 100, sourceQuery: query.query, sourcePosition: index + 1, imageUrls: [], indicativePrice: index === 1 ? 4500 : 3900, indicativeStore: `Loja ${index}` }));
    vi.spyOn(provider, "searchGoogleResults").mockResolvedValue([]);
    const search = vi.spyOn(provider, "searchDetailed").mockResolvedValue({ results: [], detailCandidates: [], rawCount: 0 });
    const details = vi.spyOn(provider, "offersFor").mockResolvedValue([]);
    const result = await discoverProducts(query, provider);
    expect(details).toHaveBeenCalledTimes(7);
    expect(details.mock.calls.map(([candidate]) => candidate.productId)).not.toContain("p0");
    expect(search).toHaveBeenCalledTimes(1);
    expect(result.metrics.detailCalls).toBe(7);
    expect(result.metrics.storePageCalls).toBe(0);
    expect(result.metrics.searchCalls + result.metrics.detailCalls + result.metrics.storePageCalls).toBeLessThanOrEqual(8);
  });
  it("keeps already received compatible offers with an unstated measure through final cards", async () => {
    const query = interpretShopperIntent("notebook lenovo i5 16gb", null);
    const provider = new SerpApiProductSearchProvider();
    const item = (title: string, url: string, store: string): SearchedProduct => ({ id: url, provider: "fixture", title, productTitle: title, price: 2900, previousPrice: null, currency: "BRL", store, brand: null, imageUrl: null, productUrl: url, rating: null, reviewCount: null, shipping: null, availability: null, discountPercent: null, match: { query: 75, budget: 50, style: 50, completeness: 60, total: 75 }, reason: "" });
    vi.spyOn(provider, "searchGoogleResults").mockResolvedValue([item("Notebook Lenovo i5", "https://a.example/notebook", "Loja A")]);
    vi.spyOn(provider, "searchDetailed").mockResolvedValue({ results: [item("Notebook Lenovo i5 8GB", "https://b.example/notebook", "Loja B")], detailCandidates: [], rawCount: 1 });
    const result = await discoverProducts(query, provider);
    expect(result.results.map((offer) => offer.store)).toEqual(["Loja A"]);
    expect(result.metrics.stageCounts).toMatchObject({ afterCompatibility: 1, afterDeduplication: 1, finalOffers: 1 });
    expect(result.metrics.stageCounts.beforeCompatibility).toBeGreaterThan(1);
    expect(result.metrics.timingsMs.total).toBeGreaterThanOrEqual(0);
  });
  it("does not cap commercially distinct offers already returned by a search source", async () => {
    const query = interpretShopperIntent("panela tramontina 24cm", null);
    const provider = new SerpApiProductSearchProvider();
    const offers: SearchedProduct[] = Array.from({ length: 15 }, (_, index) => ({ id: `offer-${index}`, provider: "fixture", title: "Panela Tramontina 24cm", productTitle: "Panela Tramontina 24cm", price: 100 + index, previousPrice: null, currency: "BRL", store: `Loja ${index}`, brand: null, imageUrl: null, productUrl: `https://store-${index}.example/panela`, rating: null, reviewCount: null, shipping: null, availability: null, discountPercent: null, match: { query: 100, budget: 50, style: 50, completeness: 60, total: 90 }, reason: "" }));
    vi.spyOn(provider, "searchGoogleResults").mockResolvedValue([]);
    vi.spyOn(provider, "searchDetailed").mockResolvedValue({ results: offers, detailCandidates: [], rawCount: offers.length });
    const details = vi.spyOn(provider, "offersFor");
    const result = await discoverProducts(query, provider);
    expect(result.results).toHaveLength(15);
    expect(result.variations.flatMap((variation) => variation.offers)).toHaveLength(15);
    expect(result.metrics.stageCounts.finalOffers).toBe(15);
    expect(details).not.toHaveBeenCalled();
  });
  it("uses commercial offers in the regular Google shopping block and keeps immersive cards as candidates", async () => {
    const query = interpretShopperIntent("panela tramontina 24cm", null);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      shopping_results: [{ title: "Panela Tramontina 24cm", source: "Loja A", extracted_price: 120, link: "https://example.com/panela", product_id: "p1", immersive_product_page_token: "token" }],
      immersive_products: [{ title: "Panela Tramontina 24cm", extracted_price: 100, immersive_product_page_token: "other-token" }],
    }), { status: 200 }));
    const provider = new SerpApiProductSearchProvider();
    vi.spyOn(provider, "available").mockReturnValue(true);
    const offers = await provider.searchGoogleResults(query);
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({ store: "Loja A", price: 120, productUrl: "https://example.com/panela", productId: "p1", provider: "serpapi-google-shopping-inline" });
    expect(provider.googleDetailCandidates).toHaveLength(2);
  });

  it("reads categorized Shopping offers and distinguishes merchants on a shared product URL", async () => {
    const query = interpretShopperIntent("panela tramontina 24cm", null);
    const item = { title: "Panela Tramontina 24cm", product_link: "https://example.com/product", product_id: "p1", extracted_price: 120 };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      shopping_results: [{ ...item, source: "Loja A" }],
      categorized_shopping_results: [{ title: "Panelas", shopping_results: [{ ...item, source: "Loja A" }, { ...item, source: "Loja B" }, { ...item, source: "Loja A", extracted_price: 130 }] }],
    }), { status: 200 }));
    const provider = new SerpApiProductSearchProvider();
    vi.spyOn(provider, "available").mockReturnValue(true);
    const result = await provider.searchDetailed(query, query.query);
    expect(result.rawCount).toBe(4);
    expect(result.results).toHaveLength(3);
    expect(result.results.map((offer) => [offer.store, offer.price])).toEqual(expect.arrayContaining([["Loja A", 120], ["Loja B", 120], ["Loja A", 130]]));
  });

  it("keeps validated reviews from the same Shopping offer when a duplicate has richer metadata", async () => {
    const query = interpretShopperIntent("panela tramontina 24cm", null);
    const item = { title: query.query, source: "Loja A", link: "https://example.com/panela", extracted_price: 120 };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ shopping_results: [
      { ...item, rating: 5, reviews: -2 },
      { ...item, rating: 4.8, reviews: 3542 },
      { ...item, source: "Loja B", rating: 4.1, reviews: 16 },
    ] }), { status: 200 }));
    const provider = new SerpApiProductSearchProvider();
    vi.spyOn(provider, "available").mockReturnValue(true);
    const result = await provider.searchDetailed(query, query.query);
    expect(result.results).toHaveLength(2);
    expect(result.results.find((offer) => offer.store === "Loja A")).toMatchObject({ rating: 4.8, reviewCount: 3542 });
    expect(result.results.find((offer) => offer.store === "Loja B")).toMatchObject({ rating: 4.1, reviewCount: 16 });
  });

  it("keeps Shopping stock signals without using a missing stock field as rejection", async () => {
    const query = interpretShopperIntent("panela tramontina 24cm", null);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ shopping_results: [
      { title: query.query, source: "Loja A", link: "https://example.com/a", extracted_price: 120, availability: "Out of stock" },
      { title: query.query, source: "Loja B", link: "https://example.com/b", extracted_price: 130, in_stock: true },
      { title: query.query, source: "Loja C", link: "https://example.com/c", extracted_price: 140 },
    ] }), { status: 200 }));
    const provider = new SerpApiProductSearchProvider();
    vi.spyOn(provider, "available").mockReturnValue(true);
    const result = await provider.searchDetailed(query, query.query);
    expect(result.results.find((offer) => offer.store === "Loja A")?.availability).toBe("out_of_stock");
    expect(result.results.find((offer) => offer.store === "Loja B")?.availability).toBe("in_stock");
    expect(result.results.find((offer) => offer.store === "Loja C")?.availability).toBeNull();
  });

  it("does not present an installment or zero upfront payment as a full product price", async () => {
    const query = interpretShopperIntent("notebook lenovo 16gb", null);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ shopping_results: [
      { title: query.query, source: "Loja A", link: "https://example.com/a", price: "R$ 99/mês", extracted_price: 99, installment: { extracted_price: 99, period: 36 } },
      { title: query.query, source: "Loja B", link: "https://example.com/b", price: "R$ 0 agora", extracted_price: 0 },
      { title: query.query, source: "Loja C", link: "https://example.com/c", price: "R$ 3500", extracted_price: 3500, installment: { extracted_price: 350, period: 10 }, snippet: "16 GB de memória", second_hand_condition: "Recondicionado" },
    ] }), { status: 200 }));
    const provider = new SerpApiProductSearchProvider();
    vi.spyOn(provider, "available").mockReturnValue(true);
    const result = await provider.searchDetailed(query, query.query);
    expect(result.results.map((offer) => offer.price)).toEqual(expect.arrayContaining([null, null, 3500]));
    expect(result.results.find((offer) => offer.store === "Loja C")).toMatchObject({ availability: "Recondicionado", attributesText: "16 GB de memória" });
  });

  it("uses a recovery candidate when the shopping map is empty", async () => {
    const query = interpretShopperIntent("panela tramontina 24cm", null);
    const provider = new SerpApiProductSearchProvider();
    vi.spyOn(provider, "searchGoogleResults").mockResolvedValue([]);
    vi.spyOn(provider, "searchDetailed").mockImplementation(async (_query, phrase) => ({ results: [], rawCount: 0, detailCandidates: phrase === query.query ? [] : [{ productId: "fallback", token: "fallback", title: query.query, relevance: 100, sourceQuery: phrase, sourcePosition: 1, imageUrls: [] }] }));
    const details = vi.spyOn(provider, "offersFor").mockResolvedValue([]);
    const result = await discoverProducts(query, provider);
    expect(details.mock.calls.map(([candidate]) => candidate.productId)).toContain("fallback");
    expect(result.metrics.detailCalls).toBeGreaterThan(0);
    expect(result.results).toHaveLength(0);
  });

  it("keeps distinct offers through final cards while removing a true duplicate", async () => {
    const query = interpretShopperIntent("panela tramontina 24cm", null);
    const provider = new SerpApiProductSearchProvider();
    const item = (id: string, store: string, price: number): SearchedProduct => ({ id, provider: "fixture", title: query.query, productTitle: query.query, price, previousPrice: null, currency: "BRL", store, brand: null, imageUrl: null, productUrl: "https://example.com/product", rating: null, reviewCount: null, shipping: null, availability: null, discountPercent: null, match: { query: 100, budget: 50, style: 50, completeness: 60, total: 90 }, reason: "" });
    vi.spyOn(provider, "searchGoogleResults").mockResolvedValue([item("a", "Loja A", 120)]);
    vi.spyOn(provider, "searchDetailed").mockResolvedValue({ results: [item("duplicate", "Loja A", 120), item("b", "Loja B", 120), item("c", "Loja A", 130)], detailCandidates: [], rawCount: 3 });
    const result = await discoverProducts(query, provider);
    expect(result.results.map((offer) => [offer.store, offer.price])).toEqual(expect.arrayContaining([["Loja A", 120], ["Loja B", 120], ["Loja A", 130]]));
    expect(result.results).toHaveLength(3);
    expect(result.variations.flatMap((variation) => variation.offers)).toHaveLength(3);
  });

  it("removes only unavailable shops and drops a variation when every shop is unavailable", async () => {
    const query = interpretShopperIntent("panela tramontina 24cm", null);
    const provider = new SerpApiProductSearchProvider();
    const make = (id: string, store: string, availability: string | null): SearchedProduct => ({ id, provider: "fixture", title: query.query, productTitle: query.query, price: 120, previousPrice: null, currency: "BRL", store, brand: null, imageUrl: null, productUrl: `https://${id}.example/panela`, rating: 4.8, reviewCount: 3542, shipping: null, availability, discountPercent: null, match: { query: 100, budget: 50, style: 50, completeness: 60, total: 90 }, reason: "" });
    vi.spyOn(provider, "searchGoogleResults").mockResolvedValue([]);
    vi.spyOn(provider, "searchDetailed").mockResolvedValue({ results: [make("sold", "Loja A", "out_of_stock"), make("available", "Loja B", "in_stock"), make("unknown", "Loja C", null)], detailCandidates: [], rawCount: 3 });
    const mixed = await discoverProducts(query, provider);
    expect(mixed.results.map((offer) => offer.store)).toEqual(expect.arrayContaining(["Loja B", "Loja C"]));
    expect(mixed.results).toHaveLength(2);
    expect(mixed.variations.flatMap((variation) => variation.offers)).toHaveLength(2);
    expect(mixed.results.find((offer) => offer.store === "Loja B")).toMatchObject({ rating: 4.8, reviewCount: 3542 });
    expect(mixed.metrics.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ reason: "out_of_stock", store: "Loja A" })]));
    vi.spyOn(provider, "searchDetailed").mockResolvedValue({ results: [make("sold", "Loja A", "out_of_stock")], detailCandidates: [], rawCount: 1 });
    const empty = await discoverProducts(query, provider);
    expect(empty.results).toHaveLength(0);
    expect(empty.variations).toHaveLength(0);
  });

  it("preserves a complete rating and review pair for a deduplicated commercial offer", async () => {
    const query = interpretShopperIntent("panela tramontina 24cm", null);
    const provider = new SerpApiProductSearchProvider();
    const make = (id: string, store: string, rating: number | null, reviewCount: number | null): SearchedProduct => ({ id, provider: "fixture", title: query.query, productTitle: query.query, price: 120, previousPrice: null, currency: "BRL", store, brand: null, imageUrl: null, productUrl: "https://example.com/product", rating, reviewCount, shipping: null, availability: null, discountPercent: null, match: { query: 100, budget: 50, style: 50, completeness: 60, total: 90 }, reason: "" });
    vi.spyOn(provider, "searchGoogleResults").mockResolvedValue([make("first", "Loja A", 5, null)]);
    vi.spyOn(provider, "searchDetailed").mockResolvedValue({ results: [make("duplicate", "Loja A", 4.8, 3542), make("other-store", "Loja B", 4.1, 16)], detailCandidates: [], rawCount: 2 });
    const result = await discoverProducts(query, provider);
    expect(result.results).toHaveLength(2);
    expect(result.results.find((offer) => offer.store === "Loja A")).toMatchObject({ rating: 4.8, reviewCount: 3542 });
    expect(result.results.find((offer) => offer.store === "Loja B")).toMatchObject({ rating: 4.1, reviewCount: 16 });
  });

  it("rejects a contradictory offer before it can displace a compatible offer with the same commercial key", async () => {
    const query = interpretShopperIntent("ração gatos 10kg", null);
    const provider = new SerpApiProductSearchProvider();
    const make = (title: string, id: string): SearchedProduct => ({ id, provider: "fixture", title, productTitle: "Ração gatos 10kg", price: 180, previousPrice: null, currency: "BRL", store: "Loja A", brand: null, imageUrl: null, productUrl: "https://example.com/shared", rating: null, reviewCount: null, shipping: null, availability: null, discountPercent: null, match: { query: 100, budget: 50, style: 50, completeness: 60, total: 90 }, reason: "" });
    vi.spyOn(provider, "searchGoogleResults").mockResolvedValue([make("Ração gatos 500g", "bad")]);
    vi.spyOn(provider, "searchDetailed").mockResolvedValue({ results: [make("Ração gatos 10000g", "good")], detailCandidates: [], rawCount: 1 });
    const result = await discoverProducts(query, provider);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].id).toBe("good");
  });

  it("follows a documented store page token and keeps offers from both pages", async () => {
    const query = interpretShopperIntent("panela tramontina 24cm", null);
    const provider = new SerpApiProductSearchProvider();
    const candidate = { productId: "p1", token: "product-token", title: query.query, relevance: 100, sourceQuery: query.query, sourcePosition: 1, imageUrls: [] };
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ product_results: { title: query.query, stores_next_page_token: "page-two", stores: [{ name: "Loja A", title: query.query, link: "https://example.com/a", extracted_price: 120, rating: 4.8, reviews: 3542, details_and_offers: ["In stock online"] }] } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ product_results: { title: query.query, stores: [{ name: "Loja B", title: query.query, link: "https://example.com/b", extracted_price: 130, rating: 6, reviews: -2, details_and_offers: ["Sold out"] }] } }), { status: 200 }));
    const first = await provider.offersFor(candidate, query);
    expect(provider.nextStorePageTokens.get(candidate.token)).toBe("page-two");
    const second = await provider.offersFor(candidate, query, provider.nextStorePageTokens.get(candidate.token));
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get("next_page_token")).toBe("page-two");
    expect([...first, ...second].map((offer) => offer.store)).toEqual(["Loja A", "Loja B"]);
    expect(first[0]).toMatchObject({ rating: 4.8, reviewCount: 3542, availability: "in_stock" });
    expect(second[0]).toMatchObject({ rating: null, reviewCount: null, availability: "out_of_stock" });
    expect(provider.nextStorePageTokens.has(candidate.token)).toBe(false);
  });

  it("caps additional store pages at two and does not follow a third token", async () => {
    const query = interpretShopperIntent("panela tramontina 24cm", null);
    const provider = new SerpApiProductSearchProvider();
    provider.googleDetailCandidates = Array.from({ length: 3 }, (_, i) => ({ productId: `p${i}`, token: `token-${i}`, title: query.query, relevance: 100 - i, sourceQuery: query.query, sourcePosition: i + 1, imageUrls: [] }));
    vi.spyOn(provider, "searchGoogleResults").mockResolvedValue([]);
    vi.spyOn(provider, "searchDetailed").mockResolvedValue({ results: [], detailCandidates: [], rawCount: 0 });
    const detail = vi.spyOn(provider, "offersFor").mockImplementation(async (candidate, _query, page) => {
      if (!page) provider.nextStorePageTokens.set(candidate.token, `next-${candidate.token}`);
      else provider.nextStorePageTokens.set(candidate.token, "third-page");
      return [{ id: `${candidate.productId}-${page || "first"}`, provider: "fixture", title: query.query, productTitle: query.query, price: 120, previousPrice: null, currency: "BRL", store: page ? `Loja extra ${candidate.productId}` : `Loja ${candidate.productId}`, brand: null, imageUrl: null, productUrl: `https://example.com/${candidate.productId}/${page || "first"}`, rating: null, reviewCount: null, shipping: null, availability: null, discountPercent: null, match: { query: 100, budget: 50, style: 50, completeness: 60, total: 90 }, reason: "" }];
    });
    const result = await discoverProducts(query, provider);
    expect(result.metrics.detailCalls).toBe(3);
    expect(result.metrics.storePageCalls).toBe(1);
    expect(detail.mock.calls.filter(([, , page]) => page)).toHaveLength(1);
    expect(result.results).toHaveLength(4);
  });
  it("reads priced offers from the exact Google query, preserving variants of wording and units", async () => {
    const query = interpretShopperIntent("kit shampoo e condicionador wella 1l invigo", null);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      product_result: {
        title: "Kit Shampoo e Condicionador Wella Invigo Nutri Enrich 1L",
        pricing: [
          { name: "Loja A", description: "Kit Wella Invigo SH 1000ml + Cond. 1L", extracted_price: 319.9, link: "https://example.com/kit", thumbnail: "https://example.com/kit.jpg" },
          { name: "Loja B", description: "Kit Wella Invigo 1L", extracted_price: 350, link: "javascript:invalid" },
        ],
      },
    }), { status: 200 }));
    const provider = new SerpApiProductSearchProvider();
    vi.spyOn(provider, "available").mockReturnValue(true);
    const offers = await provider.searchGoogleResults(query);
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get("q")).toBe(query.query);
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({ price: 319.9, productUrl: "https://example.com/kit", store: "Loja A" });
    expect(offers[0].match.query).toBeGreaterThanOrEqual(80);
  });

  it.each([
    ["Notebook Lenovo 16GB 512GB", "Lenovo Notebook 512 GB SSD 16 GB RAM"],
    ["Tênis Nike tamanho 42", "Nike Tênis Air Tam. 42"],
    ["Perfume Dior 100ml", "Dior Perfume 100 ml"],
  ])("ranks equivalent product wording for %s", async (message, title) => {
    const query = interpretShopperIntent(message, null);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ product_result: { title, pricing: [{ name: "Loja", description: title, extracted_price: 200, link: "https://example.com/product" }] } }), { status: 200 }));
    const provider = new SerpApiProductSearchProvider();
    vi.spyOn(provider, "available").mockReturnValue(true);
    const [offer] = await provider.searchGoogleResults(query);
    expect(offer.match.query).toBeGreaterThanOrEqual(75);
  });

  it("keeps an exact relevant offer without an image and deduplicates it against Shopping", async () => {
    const query = interpretShopperIntent("kit shampoo e condicionador wella 1l invigo", null);
    const offer = (title: string, url: string, total: number): SearchedProduct => ({ id: url, provider: "fixture", title, productTitle: title, price: 319.9, previousPrice: null, currency: "BRL", store: "Loja A", brand: null, imageUrl: null, productUrl: url, rating: null, reviewCount: null, shipping: null, availability: null, discountPercent: null, match: { query: total, budget: 50, style: 50, completeness: 60, total }, reason: "" });
    const exact = offer("Kit Shampoo e Condicionador Wella Invigo Nutri Enrich 1L", "https://example.com/kit", 95);
    const duplicate = offer(exact.title, exact.productUrl, 95);
    const lessRelevant = offer("Kit Wella Invigo Shampoo 1L + Condicionador 1L", "https://example.com/other", 70);
    const provider = new SerpApiProductSearchProvider();
    vi.spyOn(provider, "searchGoogleResults").mockResolvedValue([exact]);
    const shopping = vi.spyOn(provider, "searchDetailed").mockResolvedValue({ results: [duplicate, lessRelevant], detailCandidates: [], rawCount: 2 });
    const discovered = await discoverProducts(query, provider);
    expect(discovered.results.map((result) => result.productUrl)).toEqual([exact.productUrl, lessRelevant.productUrl]);
    expect(discovered.metrics.uniqueResults).toBe(2);
    expect(discovered.variations[0].imageUrl).toBeNull();
    expect(shopping.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it("uses broader queries only when the exact results are scarce", async () => {
    const query = interpretShopperIntent("Perfume Dior 100ml", null);
    const provider = new SerpApiProductSearchProvider();
    const results = Array.from({ length: 8 }, (_, index): SearchedProduct => ({ id: String(index), provider: "fixture", title: `Perfume Dior 100ml oferta ${index}`, price: 200, previousPrice: null, currency: "BRL", store: "Loja", brand: null, imageUrl: null, productUrl: `https://example.com/${index}`, rating: null, reviewCount: null, shipping: null, availability: null, discountPercent: null, match: { query: 100, budget: 50, style: 50, completeness: 60, total: 90 }, reason: "" }));
    vi.spyOn(provider, "searchGoogleResults").mockResolvedValue([]);
    const shopping = vi.spyOn(provider, "searchDetailed").mockResolvedValue({ results, detailCandidates: [], rawCount: results.length });
    const discovered = await discoverProducts(query, provider);
    expect(shopping).toHaveBeenCalledTimes(1);
    expect(discovered.metrics.queries).toEqual([query.query]);
    expect(discovered.results).toHaveLength(8);
  });

  it("does not start a recovery search after a healthy shopping map", async () => {
    const query = interpretShopperIntent("panela tramontina 24cm", null);
    const provider = new SerpApiProductSearchProvider();
    const offer = { id: "early", provider: "fixture", title: query.query, productTitle: query.query, price: 120, previousPrice: null, currency: "BRL" as const, store: "Loja A", brand: null, imageUrl: null, productUrl: "https://example.com/early", rating: null, reviewCount: null, shipping: null, availability: null, discountPercent: null, match: { query: 100, budget: 50, style: 50, completeness: 60, total: 90 }, reason: "" };
    vi.spyOn(provider, "searchGoogleResults");
    vi.spyOn(provider, "offersFor").mockResolvedValue([]);
    const search = vi.spyOn(provider, "searchDetailed").mockResolvedValue({ results: Array.from({ length: 6 }, (_, index) => ({ ...offer, id: `o${index}`, productUrl: `https://example.com/${index}`, store: `Loja ${index}` })), detailCandidates: [{ productId: "p1", token: "p1", title: query.query, relevance: 100, sourceQuery: query.query, sourcePosition: 1, imageUrls: [] }], rawCount: 6 });
    const result = await discoverProducts(query, provider);
    expect(search).toHaveBeenCalledTimes(1);
    expect(result.results.length).toBeGreaterThanOrEqual(6);
  });

  it("filters out-of-stock shopping offers and still opens the remaining product card", async () => {
    const query = interpretShopperIntent("panela tramontina 24cm", null);
    const provider = new SerpApiProductSearchProvider();
    const offer = (id: string, availability: string | null = null): SearchedProduct => ({ id, provider: "fixture", title: query.query, productTitle: query.query, price: 120, previousPrice: null, currency: "BRL", store: "Loja A", brand: null, imageUrl: null, productUrl: `https://example.com/${id}`, rating: null, reviewCount: null, shipping: null, availability, discountPercent: null, match: { query: 100, budget: 50, style: 50, completeness: 60, total: 90 }, reason: "" });
    vi.spyOn(provider, "searchDetailed").mockResolvedValue({ results: [offer("first"), offer("late"), offer("sold", "out_of_stock")], detailCandidates: [{ productId: "late-product", token: "late-token", title: query.query, relevance: 100, sourceQuery: query.query, sourcePosition: 1, imageUrls: [] }], rawCount: 3 });
    const details = vi.spyOn(provider, "offersFor").mockResolvedValue([]);
    const result = await discoverProducts(query, provider);
    expect(result.results.map((item) => item.id)).toEqual(expect.arrayContaining(["first", "late"]));
    expect(result.results).toHaveLength(2);
    expect(result.metrics.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ reason: "out_of_stock" })]));
    expect(details.mock.calls.map(([candidate]) => candidate.productId)).toContain("late-product");
    expect(result.metrics.searchCalls).toBe(1);
  });
});
