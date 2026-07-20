import { describe, expect, it } from "vitest";
import { extractStructuredPriceData } from "../services/promoRadarService.js";

describe("promoRadarService", () => {
  it("extrai o preco visual da Cha Matte sem usar parcela ou frete", () => {
    const html = `
      <meta property="og:price:amount" content="156,92">
      <div class="price">
        <del data-total-compare-price>R$ 170,00</del>
        <ins data-total-price>R$ 156,92</ins>
        <div class="tag-discount">8% OFF</div>
      </div>
      <div class="card-product-installments">
        <span class="installment-amount" data-installment-amount>R$ 15,69</span>
      </div>
      <div class="card-product-pix-discount" data-pix-price>
        <span class="pix-amount" data-pix-amount>R$ 149,07</span> com PIX (-5%)
      </div>
    `;

    expect(extractStructuredPriceData(html)).toEqual({
      currentPrice: 156.92,
      referencePrice: 170,
    });
  });

  it("usa o json embarcado da pagina quando o markup visual nao estiver presente", () => {
    const html = `
      {"price":15692,"price_min":15692,"compare_at_price":17000,"compare_at_price_min":17000}
    `;

    expect(extractStructuredPriceData(html)).toEqual({
      currentPrice: 156.92,
      referencePrice: 170,
    });
  });
});
