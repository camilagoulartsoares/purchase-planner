import { describe, expect, it } from "vitest";
import {
  analyzeProductWithPage,
  buildShopifyHtmlFromJson,
  extractStructuredPriceData,
  matchProductToPage,
  normalizeUrl,
  requestedSizeAvailability,
} from "../services/promoRadarService.js";
import type { ProductWithRelations } from "../repositories/productRepository.js";

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: "prod-1",
    userId: "user-1",
    brandId: "brand-1",
    name: "Legging Detalhes - Preto",
    category: "Calcas",
    store: "Cha Matte",
    originalPrice: 170,
    promotionalPrice: 170,
    shippingPrice: null,
    purchaseUrl: "https://www.chamatte.com.br/products/legging-detalhes-preto?utm_source=ig",
    imageUrl: "https://cdn.example.com/legging-preto.jpg",
    imagePublicId: null,
    color: "Preto",
    size: "P",
    priority: "Quero",
    status: "Quero comprar",
    notes: null,
    isFavorite: false,
    purchasedPrice: null,
    purchasedAt: null,
    createdAt: new Date("2026-07-20T10:00:00.000Z"),
    updatedAt: new Date("2026-07-20T10:00:00.000Z"),
    brand: {
      id: "brand-1",
      userId: "user-1",
      name: "Cha Matte",
      slug: "cha-matte",
      logoUrl: null,
      logoPublicId: null,
      createdAt: new Date("2026-07-20T10:00:00.000Z"),
      updatedAt: new Date("2026-07-20T10:00:00.000Z"),
    },
    images: [
      {
        id: "img-1",
        productId: "prod-1",
        imageUrl: "https://cdn.example.com/legging-preto.jpg",
        imagePublicId: "img-1",
        position: 0,
        isMain: true,
        createdAt: new Date("2026-07-20T10:00:00.000Z"),
      },
    ],
    ...overrides,
  } as unknown as ProductWithRelations;
}

function makePage(html: string, overrides: Partial<{
  url: string;
  finalUrl: string;
  normalizedUrl: string;
  statusCode: number;
  blocked: boolean;
  unavailable: boolean;
  verificationFailed: boolean;
  redirected: boolean;
}> = {}) {
  const url = overrides.url || "https://www.chamatte.com.br/products/legging-detalhes-preto";
  return {
    url,
    finalUrl: overrides.finalUrl || url,
    normalizedUrl: overrides.normalizedUrl || normalizeUrl(url),
    statusCode: overrides.statusCode ?? 200,
    html,
    blocked: overrides.blocked ?? false,
    unavailable: overrides.unavailable ?? false,
    verificationFailed: overrides.verificationFailed ?? false,
    redirected: overrides.redirected ?? false,
  };
}

describe("promoRadarService", () => {
  it("identifica tamanho P indisponivel em seletores de lojas diferentes", () => {
    expect(requestedSizeAvailability('<select aria-label="Tamanho"><option>P</option><option disabled>M</option></select>', "P")).toBe(true);
    expect(requestedSizeAvailability('<button class="size sold-out">P</button><button class="size">M</button>', "P")).toBe(false);
    expect(requestedSizeAvailability('<script>{"option1":"P","available":false}</script>', "P")).toBe(false);
  });

  it("normaliza URL removendo tracking e barra final", () => {
    expect(
      normalizeUrl(
        "http://www.chamatte.com.br/products/legging-detalhes-preto/?utm_source=ig&utm_campaign=promo#gallery",
      ),
    ).toBe("https://chamatte.com.br/products/legging-detalhes-preto");
  });

  it("confirma promocao real com nome levemente diferente e PIX separado", () => {
    const product = makeProduct();
    const page = makePage(`
      <title>Legging Detalhes Preto</title>
      <meta property="og:title" content="Legging Detalhes Preto">
      <meta property="og:description" content="Legging Cha Matte preta.">
      <meta property="og:image" content="https://cdn.example.com/legging-preto.jpg">
      <meta property="og:price:amount" content="156,92">
      <script type="application/ld+json">
        {"@context":"https://schema.org","@type":"Product","name":"Legging Detalhes Preto","brand":{"@type":"Brand","name":"Cha Matte"},"category":"Calcas","sku":"LEG06PREP","offers":{"@type":"Offer","price":"156.92","priceCurrency":"BRL","availability":"https://schema.org/InStock"}}
      </script>
      <div class="price">
        <del data-total-compare-price>R$ 170,00</del>
        <ins data-total-price>R$ 156,92</ins>
        <div class="tag-discount">8% OFF</div>
      </div>
      <div class="card-product-pix-discount">
        <span class="pix-amount">R$ 149,07</span> com PIX (-5%)
      </div>
    `);

    const result = analyzeProductWithPage(product, page);

    expect(result.productMatched).toBe(true);
    expect(result.matchConfidence).toBeGreaterThan(0.55);
    expect(result.isOnSale).toBe(true);
    expect(result.autoDisplayEligible).toBe(true);
    expect(result.originalPrice).toBe(170);
    expect(result.salePrice).toBe(156.92);
    expect(result.discountPercentage).toBe(8);
    expect(result.pixPrice).toBe(149.07);
    expect(result.status).toBe("ok");
    expect(result.evidence).toContain("Preco original riscado na pagina");
  });

  it("nao considera cupom como promocao principal quando o preco principal nao caiu", () => {
    const product = makeProduct({ originalPrice: 170, promotionalPrice: 170 });
    const page = makePage(`
      <title>Legging Detalhes Preto</title>
      <script type="application/ld+json">
        {"@context":"https://schema.org","@type":"Product","name":"Legging Detalhes Preto","brand":{"@type":"Brand","name":"Cha Matte"},"offers":{"@type":"Offer","price":"170.00","priceCurrency":"BRL","availability":"https://schema.org/InStock"}}
      </script>
      <div>Use o cupom LOVE para pagar R$ 150,00</div>
      <div>Comprar</div>
    `);

    const result = analyzeProductWithPage(product, page);

    expect(result.productMatched).toBe(true);
    expect(result.isOnSale).toBe(false);
    expect(result.status).toBe("ok");
    expect(result.salePrice).toBe(170);
    expect(result.originalPrice).toBeNull();
    expect(result.conditionalOffers.some((offer) => offer.type === "coupon")).toBe(true);
  });

  it("retorna mismatch quando a pagina parece de outro produto", () => {
    const product = makeProduct();
    const page = makePage(`
      <title>Body Costa Nua Branco</title>
      <script type="application/ld+json">
        {"@context":"https://schema.org","@type":"Product","name":"Body Costa Nua Branco","brand":{"@type":"Brand","name":"Nexo"},"category":"Bodies","offers":{"@type":"Offer","price":"180.00","priceCurrency":"BRL","availability":"https://schema.org/InStock"}}
      </script>
    `, {
      finalUrl: "https://www.lojanexo.com.br/body-costa-nua-branco",
      redirected: true,
    });

    const result = analyzeProductWithPage(product, page);

    expect(result.productMatched).toBe(false);
    expect(result.isOnSale).toBe(false);
    expect(result.status).toBe("product_mismatch");
    expect(result.reason).toContain("outro produto");
  });

  it("prioriza esgotado mesmo se o nome da pagina tiver divergencia", () => {
    const product = makeProduct({ name: "Body Amber Preto", size: null });
    const page = makePage(`
      <title>BODY AMBER - PRETO - Preto</title>
      <div>ESGOTADO</div><div class="variacoes"><div>Tamanhos</div><div class="item">G</div><div class="botoes">
    `);
    const result = analyzeProductWithPage(product, page);
    expect(result.status).toBe("out_of_stock");
    expect(result.reason).toContain("Tamanho P indisponivel");
  });

  it("aceita redirecionamento quando a pagina final continua sendo o mesmo produto", () => {
    const product = makeProduct();
    const page = makePage(`
      <title>Legging Detalhes Preto</title>
      <script type="application/ld+json">
        {"@context":"https://schema.org","@type":"Product","name":"Legging Detalhes Preto","brand":{"@type":"Brand","name":"Cha Matte"},"offers":{"@type":"Offer","price":"170.00","priceCurrency":"BRL","availability":"https://schema.org/InStock"}}
      </script>
      <div>Comprar</div>
    `, {
      finalUrl: "https://www.chamatte.com.br/products/legging-detalhes-preto?variant=47260210299116",
      redirected: true,
    });

    const result = analyzeProductWithPage(product, page);

    expect(result.productMatched).toBe(true);
    expect(result.status).toBe("ok");
  });

  it("retorna produto esgotado quando a pagina indica indisponibilidade", () => {
    const product = makeProduct();
    const page = makePage(`
      <title>Legging Detalhes Preto</title>
      <script type="application/ld+json">
        {"@context":"https://schema.org","@type":"Product","name":"Legging Detalhes Preto","brand":{"@type":"Brand","name":"Cha Matte"},"offers":{"@type":"Offer","price":"170.00","priceCurrency":"BRL","availability":"https://schema.org/OutOfStock"}}
      </script>
      <div>Esgotado</div>
    `);

    const result = analyzeProductWithPage(product, page);

    expect(result.productMatched).toBe(true);
    expect(result.status).toBe("out_of_stock");
    expect(result.isOnSale).toBe(false);
    expect(result.availability).toBe("out_of_stock");
  });

  it("remove a promocao quando o tamanho salvo nao esta entre os tamanhos ativos", () => {
    const product = makeProduct({ size: "P" });
    const page = makePage(`
      <title>Legging Detalhes Preto</title>
      <script type="application/ld+json">
        {"@context":"https://schema.org","@type":"Product","name":"Legging Detalhes Preto","brand":{"@type":"Brand","name":"Cha Matte"},"offers":{"@type":"Offer","price":"156.92","priceCurrency":"BRL","availability":"https://schema.org/InStock"}}
      </script>
      <div class="variacoes"><div class="t">Tamanhos</div><div class="list"><div class="item">M</div><div class="item">G</div></div><div class="botoes">
      <del data-total-compare-price>R$ 170,00</del><ins data-total-price>R$ 156,92</ins>
    `);

    const result = analyzeProductWithPage(product, page);

    expect(result.status).toBe("out_of_stock");
    expect(result.isOnSale).toBe(false);
    expect(result.autoDisplayEligible).toBe(false);
    expect(result.reason).toContain("Tamanho P indisponivel");
    expect(result.requestedSizeAvailability).toBe(false);
  });

  it("aplica P globalmente a produto antigo sem tamanho salvo", () => {
    const product = makeProduct({ name: "Calca Aurora Preta", category: "Calcas", size: null });
    const page = makePage(`
      <title>Calca Aurora Preta</title>
      <script type="application/ld+json">{"@type":"Product","name":"Calca Aurora Preta","brand":{"name":"Cha Matte"},"offers":{"price":"156.92","availability":"https://schema.org/InStock"}}</script>
      <div class="variacoes"><div>Tamanhos</div><div class="item">M</div><div class="item">G</div><div class="botoes">
      <del data-total-compare-price>R$ 170,00</del><ins data-total-price>R$ 156,92</ins>
    `);
    const result = analyzeProductWithPage(product, page);
    expect(result.status).toBe("out_of_stock");
    expect(result.reason).toContain("Tamanho P indisponivel");
  });

  it("mantem produto antigo pendente quando a pagina nao comprova uma grade", () => {
    const product = makeProduct({ name: "Calca Aurora Preta", category: "Calcas", size: null });
    const page = makePage(`
      <title>Calca Aurora Preta</title>
      <script type="application/ld+json">{"@type":"Product","name":"Calca Aurora Preta","brand":{"name":"Cha Matte"},"offers":{"price":"156.92","availability":"https://schema.org/InStock"}}</script>
      <div>Comprar agora</div>
    `);

    const result = analyzeProductWithPage(product, page);

    expect(result.status).toBe("ok");
    expect(result.requestedSizeAvailability).toBeNull();
    expect(result.isOnSale).toBe(false);
  });

  it("mantem ativo quando a grade confirma P disponivel", () => {
    const product = makeProduct({ name: "Top Aurora", category: "Tops e corsets", size: null });
    const page = makePage(`
      <title>Top Aurora</title>
      <script type="application/ld+json">{"@type":"Product","name":"Top Aurora","brand":{"name":"Cha Matte"},"offers":{"price":"100.00","availability":"https://schema.org/InStock"}}</script>
      <select aria-label="Tamanho"><option>P</option><option>M</option></select>
      <div>Comprar</div>
    `);
    const result = analyzeProductWithPage(product, page);
    expect(result.status).toBe("ok");
    expect(result.requestedSizeAvailability).toBe(true);
  });

  it("retorna price_not_found quando nao acha preco principal", () => {
    const product = makeProduct();
    const page = makePage(`
      <title>Legging Detalhes Preto</title>
      <script type="application/ld+json">
        {"@context":"https://schema.org","@type":"Product","name":"Legging Detalhes Preto","brand":{"@type":"Brand","name":"Cha Matte"}}
      </script>
      <div>Produto premium. Consulte a loja.</div>
    `);

    const result = analyzeProductWithPage(product, page);

    expect(result.productMatched).toBe(true);
    expect(result.status).toBe("price_not_found");
    expect(result.isOnSale).toBe(false);
  });

  it("retorna page_unavailable quando a pagina esta fora do ar", () => {
    const product = makeProduct();
    const page = makePage("", {
      statusCode: 404,
      unavailable: true,
    });

    const result = analyzeProductWithPage(product, page);

    expect(result.status).toBe("page_unavailable");
    expect(result.productMatched).toBe(false);
  });

  it("retorna page_unavailable somente para 410 ou 404", () => {
    const result = analyzeProductWithPage(makeProduct(), makePage("", { statusCode: 410, unavailable: true }));
    expect(result.status).toBe("page_unavailable");
    expect(result.availability).toBe("unknown");
  });

  it.each([403, 429])("mantem %s como bloqueio, sem marcar esgotado", (statusCode) => {
    const result = analyzeProductWithPage(makeProduct(), makePage("", { statusCode, blocked: true }));
    expect(result.status).toBe("access_blocked");
    expect(result.availability).toBe("unknown");
  });

  it.each([0, 500, 503])("mantem %s como falha de verificacao, sem marcar indisponivel", (statusCode) => {
    const result = analyzeProductWithPage(makeProduct(), makePage("", { statusCode, verificationFailed: true }));
    expect(result.status).toBe("analysis_failed");
    expect(result.availability).toBe("unknown");
    expect(result.reason).toContain("verificar");
  });

  it("nao assume indisponibilidade sem indicador de estoque", () => {
    const result = analyzeProductWithPage(makeProduct(), makePage(`
      <title>Legging Detalhes Preto</title>
      <script type="application/ld+json">
        {"@type":"Product","name":"Legging Detalhes Preto","brand":{"name":"Cha Matte"},"offers":{"price":"170.00"}}
      </script>
    `));
    expect(result.status).toBe("ok");
    expect(result.availability).toBe("unknown");
  });

  it("retorna access_blocked quando a loja bloqueia a leitura", () => {
    const product = makeProduct();
    const page = makePage("", {
      statusCode: 403,
      blocked: true,
    });

    const result = analyzeProductWithPage(product, page);

    expect(result.status).toBe("access_blocked");
    expect(result.productMatched).toBe(false);
  });

  it("retorna analysis_failed quando o produto nao possui purchaseUrl", () => {
    const product = makeProduct({ purchaseUrl: null });
    const page = makePage("");

    const result = analyzeProductWithPage(product, page);

    expect(result.status).toBe("analysis_failed");
    expect(result.reason).toContain("purchaseUrl");
  });

  it("faz matching tolerante com pequenas variacoes de nome", () => {
    const product = makeProduct();
    const match = matchProductToPage(product, {
      name: "Legging Detalhes Preto",
      brand: "Cha Matte",
      category: "Calcas",
      color: "Preto",
      size: "P",
      sku: "LEG06PREP",
      description: "Legging preta de alta compressao",
      title: "Legging Detalhes Preto",
      imageUrls: ["https://cdn.example.com/legging-preto.jpg"],
      currency: "BRL",
      availability: "in_stock",
      prices: {
        current: 156.92,
        original: 170,
        evidence: [],
        variantLabel: "Preto / P",
      },
      conditionalOffers: [],
      visibleText: "Legging Detalhes Preto Cha Matte Preto P",
    });

    expect(match.productMatched).toBe(true);
    expect(match.matchConfidence).toBeGreaterThan(0.8);
  });

  it("extrai compare_at_price de html estruturado", () => {
    const html = `
      <meta property="og:price:amount" content="156,92">
      <div class="price">
        <del data-total-compare-price>R$ 170,00</del>
        <ins data-total-price>R$ 156,92</ins>
      </div>
    `;

    expect(extractStructuredPriceData(html)).toMatchObject({
      currentPrice: 156.92,
      referencePrice: 170,
    });
  });

  it("mantem promocao detectavel via fallback Shopify quando o HTML da pagina falha", () => {
    const html = buildShopifyHtmlFromJson(
      "https://www.chamatte.com.br/products/legging-detalhes-preto",
      {
        title: "Legging Detalhes - Preto",
        vendor: "Cha Matte",
        type: "Calcas",
        body_html: "<p>Modelo com compressao e bolso lateral.</p>",
        images: ["https://cdn.example.com/legging-preto.jpg"],
        variants: [
          {
            title: "Preto / P",
            public_title: "Preto / P",
            sku: "LEG-DET-PRE-P",
            available: true,
            price: 15692,
            compare_at_price: 17000,
          },
        ],
      },
    );

    expect(html).not.toBeNull();
    expect(html).toContain("application/ld+json");

    const result = analyzeProductWithPage(makeProduct(), makePage(html || ""));

    expect(result.productMatched).toBe(true);
    expect(result.isOnSale).toBe(true);
    expect(result.originalPrice).toBe(170);
    expect(result.salePrice).toBe(156.92);
    expect(result.status).toBe("ok");
  });
});
