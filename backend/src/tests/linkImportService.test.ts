import { describe, expect, it } from "vitest";
import { extractProductFromHtml, normalizeFindingUrl } from "../services/linkImportService.js";

describe("linkImportService", () => {
  it("normaliza URL e remove parametros de rastreamento", () => {
    expect(normalizeFindingUrl("https://LOJA.EXEMPLO.com:443/produto?utm_source=x&sku=42#foto")).toBe("https://loja.exemplo.com/produto?sku=42");
  });

  it("extrai galeria de imagens e videos do JSON-LD, OG e HTML", () => {
    const result = extractProductFromHtml(`
      <meta property="og:title" content="Produto OG"><meta property="og:image" content="/cover.jpg">
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Vestido Aurora","brand":{"name":"Marca X"},"image":["/one.jpg","https://cdn.example/two.jpg"],"offers":{"@type":"Offer","price":"199.90","priceCurrency":"BRL","availability":"https://schema.org/InStock"}}</script>
      <img data-src="/three.jpg"><video src="/look.mp4"></video><source src="https://cdn.example/detail.mp4">
    `, "https://loja.example/produto");
    expect(result).toMatchObject({ title: "Vestido Aurora", brand: "Marca X", price: 199.9, availability: "in_stock" });
    expect(result.media).toEqual(expect.arrayContaining([
      { type: "image", url: "https://loja.example/one.jpg" },
      { type: "image", url: "https://cdn.example/two.jpg" },
      { type: "video", url: "https://loja.example/look.mp4" },
      { type: "video", url: "https://cdn.example/detail.mp4" },
    ]));
  });

  it("mantem preco vazio quando a pagina nao informa valor", () => {
    const result = extractProductFromHtml("<html><head><title>Sem preco</title></head><body></body></html>", "https://loja.example/sem-preco");
    expect(result.price).toBeNull();
    expect(result.brand).toBe("");
  });

  it("interpreta a resposta do leitor quando a loja apresenta anti-bot", () => {
    const result = extractProductFromHtml("Title: Comprar BODY CINTHIA - PRETO - R$39,90\n![frente](https://assets.example/produtos/123/frente.jpg)\n![costas](https://assets.example/produtos/123/costas.jpg)", "https://www.useelizah.com.br/body-cinthia-preto/");
    expect(result.title).toBe("BODY CINTHIA - PRETO");
    expect(result.price).toBe(39.9);
    expect(result.media).toHaveLength(2);
  });

  it("ignora recomendacoes e usa preco/itemprop da pagina principal", () => {
    const result = extractProductFromHtml(`
      <meta property="og:title" content="Calca principal">
      <section id="produto"><div class="fotos"><img src="/produtos/principal/frente_mini.jpg"><img src="/produtos/principal/costas_mini.jpg"></div><meta itemprop="price" content="219.90"></section>
      <section id="prod-relacionados"><img src="/produtos/outro/produto.jpg"><p>R$ 49,90</p></section>
    `, "https://loja.example/calca");
    expect(result.price).toBe(219.9);
    expect(result.media).toEqual([
      { type: "image", url: "https://loja.example/produtos/principal/frente_mini.jpg" },
      { type: "image", url: "https://loja.example/produtos/principal/costas_mini.jpg" },
    ]);
  });

  it("usa dados de produto em JSON embutido sem recorrer a itens relacionados", () => {
    const result = extractProductFromHtml(`
      <script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"product":{"title":"Bolsa da URL","salePrice":"129.90","listPrice":"159.90","images":["/bolsa-1.jpg","/bolsa-2.jpg"],"brand":"Marca Y"},"relatedProducts":[{"title":"Outro produto","salePrice":"9.90","images":["/outro.jpg"]}]}}}</script>
    `, "https://loja.example/bolsa-da-url");
    expect(result).toMatchObject({ title: "Bolsa da URL", brand: "Marca Y", price: 129.9, previousPrice: 159.9 });
    expect(result.media).toEqual([
      { type: "image", url: "https://loja.example/bolsa-1.jpg" },
      { type: "image", url: "https://loja.example/bolsa-2.jpg" },
    ]);
  });
});
