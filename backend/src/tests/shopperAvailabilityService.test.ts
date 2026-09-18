import { describe, expect, it } from "vitest";
import { availabilityFromSource, isExplicitlyUnavailable } from "../services/shopperAvailabilityService.js";

describe("shopper offer availability", () => {
  it.each([
    [{ availability: "https://schema.org/OutOfStock" }, "out_of_stock"],
    [{ availability: "Esgotado" }, "out_of_stock"],
    [{ in_stock: false }, "out_of_stock"],
    [{ out_of_stock: true }, "out_of_stock"],
    [{ stock: 0 }, "out_of_stock"],
    [{ details_and_offers: ["Fora de estoque", "Frete grátis"] }, "out_of_stock"],
    [{ availability: "In stock" }, "in_stock"],
    [{ stock: 4 }, "in_stock"],
    [{ details_and_offers: ["Em estoque online"] }, "in_stock"],
    [{ details_and_offers: ["Frete grátis"] }, null],
    [{ buying_options: ["Delivery unavailable"] }, null],
    [{}, null],
  ] as const)("classifies a structured source signal %#", (source, expected) => {
    expect(availabilityFromSource(source)).toBe(expected);
  });

  it("does not infer stock from a price or a missing stock field", () => {
    expect(availabilityFromSource({})).toBeNull();
    expect(isExplicitlyUnavailable(null)).toBe(false);
    expect(isExplicitlyUnavailable("Disponível")).toBe(false);
  });
});
