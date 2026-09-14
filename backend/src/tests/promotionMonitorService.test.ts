import { describe, expect, it } from "vitest";
import { collectProviderOffers, isEligibleOffer, isRelevantOffer, shouldSendAlert } from "../services/promotionMonitorService.js";
import type { ShoppingOffer, ShoppingProvider } from "../services/shoppingProviders/types.js";

const offer = (price: number, shipping: number | null): ShoppingOffer => ({ store: "Teste", title: "Shampoo Wella Professionals", price, shipping, totalPrice: shipping == null ? null : price + shipping, originalPrice: null, discountPercentage: null, url: "https://example.test/item", imageUrl: null, seller: null, availability: "in_stock" });

describe("promotion monitor rules", () => {
  it("alerts when product plus shipping is within the limit", () => expect(isEligibleOffer(offer(350, 30), 390)).toBe(true));
  it("does not alert when product plus shipping exceeds the limit", () => expect(isEligibleOffer(offer(350, 50), 390)).toBe(false));
  it("does not alert when shipping is unknown", () => expect(isEligibleOffer(offer(350, null), 390)).toBe(false));
  it("does not repeat the same URL and price during cooldown", () => expect(shouldSendAlert({ totalPrice: 380, sentAt: new Date() }, offer(350, 30), 24)).toBe(false));
  it("allows a new alert when price drops", () => expect(shouldSendAlert({ totalPrice: 380, sentAt: new Date() }, offer(320, 20), 24)).toBe(true));
  it("removes an obviously irrelevant result", () => expect(isRelevantOffer("Shampoo Wella", "Condicionador Wella 1L")).toBe(false));
  it("continues when one provider fails", async () => {
    const providers: ShoppingProvider[] = [
      { id: "broken", status: "operational", async search() { throw new Error("timeout"); } },
      { id: "working", status: "operational", async search() { return [offer(350, 30)]; } },
    ];
    await expect(collectProviderOffers(providers, "Shampoo Wella", "01001000")).resolves.toHaveLength(1);
  });
});
