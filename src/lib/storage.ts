import type { Budget, ClosetItem } from "../types";
import { STORAGE_BUDGET, STORAGE_ITEMS, STORAGE_SEEDED } from "../types";
import { demoItems } from "./demo";

export function loadItems(): ClosetItem[] {
  const raw = localStorage.getItem(STORAGE_ITEMS);
  if (raw) {
    try {
      return JSON.parse(raw) as ClosetItem[];
    } catch {
      return [];
    }
  }

  const seeded = localStorage.getItem(STORAGE_SEEDED);
  if (!seeded) {
    localStorage.setItem(STORAGE_ITEMS, JSON.stringify(demoItems));
    localStorage.setItem(STORAGE_SEEDED, "1");
    return demoItems;
  }

  return [];
}

export function saveItems(items: ClosetItem[]) {
  localStorage.setItem(STORAGE_ITEMS, JSON.stringify(items));
  localStorage.setItem(STORAGE_SEEDED, "1");
}

export function loadBudget(): Budget {
  const raw = localStorage.getItem(STORAGE_BUDGET);
  if (!raw) return { monthlyLimit: 1000 };
  try {
    return JSON.parse(raw) as Budget;
  } catch {
    return { monthlyLimit: 1000 };
  }
}

export function saveBudget(budget: Budget) {
  localStorage.setItem(STORAGE_BUDGET, JSON.stringify(budget));
}
