import { describe, expect, it } from "vitest";
import { calculatePurchaseScore, simulateBudgetAfterPurchase, type AnalysisProduct } from "../services/purchaseAnalysisService.js";

const base: AnalysisProduct = { id: "target", name: "Calça", category: "Calças", brand: "Marca", price: 100, priority: "Quero muito", isFavorite: true, purchaseIntent: "NEED", estimatedUses: 20, timesPostponed: 0, createdAt: new Date("2026-01-01"), imageUrl: null };
const other: AnalysisProduct = { ...base, id: "other", name: "Blusa", price: 80, priority: "Quero", isFavorite: false };
const expensive: AnalysisProduct = { ...base, id: "expensive", name: "Casaco", price: 150, priority: "Quero", isFavorite: false };

describe("purchase analysis", () => {
  it("pontua prioridade, favorito, necessidade e custo por uso sem aleatoriedade", () => {
    const result = calculatePurchaseScore(base, { budget: 300, similarCount: 0 });
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.estimatedCostPerUse).toBe(5);
    expect(result.positiveReasons).toContain("Está nos favoritos");
  });
  it("simula quais produtos deixam de caber após a compra", () => {
    const simulation = simulateBudgetAfterPurchase(base, [other, expensive], 200);
    expect(simulation.remainingBudget).toBe(100);
    expect(simulation.stillAffordable.map((product) => product.id)).toContain("other");
    expect(simulation.noLongerAffordable.map((product) => product.id)).toContain("expensive");
  });
});
