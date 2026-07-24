import { describe, expect, it } from "vitest";
import { buildLocalAssistantReply, type AssistantProduct } from "../services/shoppingAssistantService.js";

const products: AssistantProduct[] = [
  { id: "high", name: "Calça de alfaiataria", category: "Calças", brand: "Marca", store: "Loja", price: 279, originalPrice: 350, discountPercent: 20, priority: "Quero muito", status: "Quero comprar", isFavorite: true, createdAt: "2026-01-01T00:00:00.000Z", imageUrl: null },
  { id: "fit", name: "Top fitness", category: "Moda fitness", brand: "Marca", store: "Loja", price: 90, originalPrice: 90, discountPercent: 0, priority: "Quero", status: "Quero comprar", isFavorite: false, createdAt: "2026-02-01T00:00:00.000Z", imageUrl: null },
  { id: "maybe", name: "Bolsa cara", category: "Bolsas", brand: "Marca", store: "Loja", price: 600, originalPrice: 600, discountPercent: 0, priority: "Talvez", status: "Quero comprar", isFavorite: false, createdAt: "2026-06-01T00:00:00.000Z", imageUrl: null },
];

describe("shopping assistant local mode", () => {
  it("monta combo respeitando o orçamento e categoria", () => {
    const reply = buildLocalAssistantReply("Monte um combo para academia até R$ 100", products);
    expect(reply.recommendedProductIds).toEqual(["fit"]);
    expect(reply.total).toBe(90);
    expect(reply.remainingBudget).toBe(10);
  });
  it("aponta item de baixa prioridade e preço alto para adiar", () => {
    const reply = buildLocalAssistantReply("Qual compra devo adiar?", products);
    expect(reply.recommendedProductIds).toEqual(["maybe"]);
  });
});
