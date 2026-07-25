import { prisma } from "../config/prisma.js";
import { AppError } from "../middlewares/errorHandler.js";

export type AnalysisProduct = { id: string; name: string; category: string; brand: string; price: number; priority: string; isFavorite: boolean; purchaseIntent: string; estimatedUses: number | null; timesPostponed: number; createdAt: Date; imageUrl: string | null };
export type BudgetSimulation = { remainingBudget: number | null; stillAffordable: AnalysisProduct[]; noLongerAffordable: AnalysisProduct[]; nextRecommendedProduct: AnalysisProduct | null; updatedSuggestedCombo: AnalysisProduct[]; comboTotal: number | null };

function priorityPoints(priority: string) { return priority === "Quero muito" ? 20 : priority === "Quero" ? 10 : 0; }
function clamp(value: number) { return Math.max(0, Math.min(100, Math.round(value))); }
function ageDays(createdAt: Date) { return Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / 86_400_000)); }
function priceBand(price: number) { return { min: price * .75, max: price * 1.25 }; }

export function calculatePurchaseScore(product: AnalysisProduct, options: { budget: number | null; similarCount: number }) {
  const positiveReasons: string[] = []; const warningReasons: string[] = []; let score = 35;
  const priority = priorityPoints(product.priority); score += priority;
  if (priority) positiveReasons.push(`Prioridade ${product.priority.toLowerCase()}`);
  if (product.isFavorite) { score += 10; positiveReasons.push("Está nos favoritos"); }
  if (product.purchaseIntent === "NEED") { score += 12; positiveReasons.push("Marcado como necessidade"); } else warningReasons.push("Marcado como desejo, não necessidade");
  const days = ageDays(product.createdAt);
  if (days >= 90) { score += 8; positiveReasons.push(`Está salvo há ${days} dias`); } else if (days >= 30) { score += 5; positiveReasons.push(`Está salvo há ${days} dias`); }
  const costPerUse = product.estimatedUses ? product.price / product.estimatedUses : null;
  if (costPerUse == null) warningReasons.push("Preencha a quantidade estimada de usos para calcular o custo por uso");
  else if (costPerUse <= 10) { score += 10; positiveReasons.push("Custo por uso estimado baixo"); }
  else if (costPerUse <= 25) { score += 5; positiveReasons.push("Custo por uso estimado razoável"); }
  else { score -= 8; warningReasons.push("Custo por uso estimado alto"); }
  if (options.similarCount >= 4) { score -= 10; warningReasons.push(`${options.similarCount} produtos semelhantes já estão na lista`); }
  else if (options.similarCount >= 2) { score -= 5; warningReasons.push(`${options.similarCount} produtos semelhantes já estão na lista`); }
  else score += 4;
  if (product.timesPostponed > 0) { const penalty = Math.min(24, product.timesPostponed * 6); score -= penalty; warningReasons.push(`Compra adiada ${product.timesPostponed} vez${product.timesPostponed > 1 ? "es" : ""}`); }
  const budget = options.budget;
  const budgetPercent = budget ? product.price / budget * 100 : null;
  if (budgetPercent == null) warningReasons.push("Informe o orçamento atual para medir o impacto");
  else if (product.price > budget!) { score -= 25; warningReasons.push("Não cabe no orçamento atual"); }
  else if (budgetPercent > 70) { score -= 12; warningReasons.push(`Consome ${Math.round(budgetPercent)}% do orçamento`); }
  else if (budgetPercent > 45) { score -= 5; warningReasons.push(`Consome ${Math.round(budgetPercent)}% do orçamento`); }
  else { score += 10; positiveReasons.push(`Consome ${Math.round(budgetPercent)}% do orçamento`); }
  return { score: clamp(score), positiveReasons, warningReasons, estimatedCostPerUse: costPerUse, budgetPercent, daysSaved: days };
}

export function simulateBudgetAfterPurchase(product: AnalysisProduct, others: AnalysisProduct[], budget: number | null): BudgetSimulation {
  if (budget == null) return { remainingBudget: null, stillAffordable: [], noLongerAffordable: [], nextRecommendedProduct: null, updatedSuggestedCombo: [], comboTotal: null };
  const remainingBudget = Math.max(0, budget - product.price);
  const active = others.filter((item) => item.price <= budget);
  const stillAffordable = active.filter((item) => item.price <= remainingBudget).sort((a, b) => a.price - b.price);
  const noLongerAffordable = active.filter((item) => item.price > remainingBudget).sort((a, b) => a.price - b.price);
  const ranked = [...stillAffordable].sort((a, b) => priorityPoints(b.priority) + (b.isFavorite ? 10 : 0) - priorityPoints(a.priority) - (a.isFavorite ? 10 : 0));
  const updatedSuggestedCombo = [...ranked].sort((a, b) => a.price - b.price).reduce<AnalysisProduct[]>((combo, item) => combo.reduce((sum, current) => sum + current.price, product.price) + item.price <= budget ? [...combo, item] : combo, []);
  return { remainingBudget, stillAffordable: stillAffordable.slice(0, 12), noLongerAffordable: noLongerAffordable.slice(0, 12), nextRecommendedProduct: ranked[0] || null, updatedSuggestedCombo, comboTotal: product.price + updatedSuggestedCombo.reduce((sum, item) => sum + item.price, 0) };
}

function classification(score: number) { return score >= 80 ? "Compra recomendada" : score >= 60 ? "Pode fazer sentido" : score >= 40 ? "Melhor avaliar" : "Melhor esperar"; }
function serialize(product: AnalysisProduct) { return { id: product.id, name: product.name, category: product.category, brand: product.brand, price: product.price, imageUrl: product.imageUrl }; }

export const purchaseAnalysisService = {
  async analyze(userId: string, productId: string, budget: number | null) {
    const rows = await prisma.product.findMany({ where: { userId }, include: { brand: true, images: { orderBy: { position: "asc" } } } });
    const products: AnalysisProduct[] = rows.filter((row) => row.status !== "Já comprei" && row.status !== "Desisti da compra").map((row) => {
      const price = Number(row.promotionalPrice ?? row.originalPrice);
      return { id: row.id, name: row.name, category: row.category, brand: row.brand.name, price, priority: row.priority, isFavorite: row.isFavorite, purchaseIntent: row.purchaseIntent, estimatedUses: row.estimatedUses, timesPostponed: row.timesPostponed, createdAt: row.createdAt, imageUrl: row.images.find((image) => image.isMain)?.imageUrl || row.images[0]?.imageUrl || row.imageUrl };
    });
    const product = products.find((item) => item.id === productId);
    if (!product) throw new AppError("Produto não encontrado ou não está disponível para análise.", 404);
    const band = priceBand(product.price);
    const similar = products.filter((item) => item.id !== product.id && (item.category === product.category || item.brand === product.brand) && item.price >= band.min && item.price <= band.max);
    const result = calculatePurchaseScore(product, { budget, similarCount: similar.length });
    const decisionStatus = classification(result.score);
    await prisma.product.update({ where: { id: product.id }, data: { lastAnalyzedAt: new Date(), decisionStatus } });
    const simulation = simulateBudgetAfterPurchase(product, products.filter((item) => item.id !== product.id), budget);
    return { ...result, classification: decisionStatus, product: serialize(product), budgetImpact: { budget, productPrice: product.price, remainingBudget: simulation.remainingBudget, budgetPercent: result.budgetPercent, productsNoLongerAffordableCount: simulation.noLongerAffordable.length }, similarProducts: similar.slice(0, 8).map(serialize), productsStillAffordable: simulation.stillAffordable.map(serialize), productsNoLongerAffordable: simulation.noLongerAffordable.map(serialize), nextRecommendedProduct: simulation.nextRecommendedProduct ? serialize(simulation.nextRecommendedProduct) : null, updatedSuggestedCombo: { products: simulation.updatedSuggestedCombo.map(serialize), total: simulation.comboTotal } };
  },
};
