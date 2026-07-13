import type { ClosetItem } from "../types";

export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function parseMoney(input: string): number {
  const cleaned = input
    .replace(/[R$\s]/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function effectivePrice(item: ClosetItem): number {
  return item.currentPrice > 0 ? item.currentPrice : item.originalPrice;
}

export function hasPromo(item: ClosetItem): boolean {
  return item.currentPrice > 0 && item.currentPrice < item.originalPrice;
}

export function discountPercent(item: ClosetItem): number {
  if (!hasPromo(item) || item.originalPrice <= 0) return 0;
  return Math.round(((item.originalPrice - item.currentPrice) / item.originalPrice) * 100);
}

export function savings(item: ClosetItem): number {
  if (!hasPromo(item)) return 0;
  return item.originalPrice - item.currentPrice;
}

export function uid(): string {
  return crypto.randomUUID();
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function inCurrentMonth(isoDate?: string): boolean {
  if (!isoDate) return false;
  const d = new Date(isoDate);
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}
