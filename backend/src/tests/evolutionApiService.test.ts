import { describe, expect, it } from "vitest";
import { formatPromotionMessage } from "../services/evolutionApiService.js";

describe("Evolution API promotion messages", () => {
  it("formats a personal promotion alert with the target and product link", () => {
    const message = formatPromotionMessage({
      productName: "Kit Wella Nutri Enrich",
      currentPrice: 129.9,
      targetPrice: 150,
      purchaseUrl: "https://example.com/promo",
    });

    expect(message).toContain("🚨 PROMOÇÃO ENCONTRADA");
    expect(message).toContain("129,90");
    expect(message).toContain("150,00");
    expect(message).toContain("https://example.com/promo");
  });
});
