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
      { type: "image", url: "https://loja.example/three.jpg" },
      { type: "video", url: "https://loja.example/look.mp4" },
      { type: "video", url: "https://cdn.example/detail.mp4" },
    ]));
  });
});
