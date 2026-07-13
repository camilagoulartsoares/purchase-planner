import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  Budget,
  ClosetItem,
  Filters,
  SortOption,
  Status,
  ViewMode,
} from "../types";
import { defaultFilters } from "../types";
import {
  discountPercent,
  effectivePrice,
  hasPromo,
  inCurrentMonth,
  savings,
} from "../lib/money";
import { loadBudget, loadItems, saveBudget, saveItems } from "../lib/storage";

function matchesPriceBand(price: number, band: Filters["priceBand"]) {
  switch (band) {
    case "ate-50":
      return price <= 50;
    case "50-100":
      return price >= 50 && price <= 100;
    case "100-200":
      return price >= 100 && price <= 200;
    case "200-300":
      return price >= 200 && price <= 300;
    case "300-500":
      return price >= 300 && price <= 500;
    case "500-1000":
      return price >= 500 && price <= 1000;
    case "acima-1000":
      return price > 1000;
    default:
      return true;
  }
}

const priorityRank: Record<string, number> = {
  "Quero muito": 3,
  Quero: 2,
  Talvez: 1,
};

export function useCloset() {
  const [items, setItems] = useState<ClosetItem[]>(() => loadItems());
  const [budget, setBudget] = useState<Budget>(() => loadBudget());
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [sort, setSort] = useState<SortOption>("recentes");
  const [view, setView] = useState<ViewMode>("cards");
  const [tab, setTab] = useState<Status | "Todas">("Quero comprar");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    saveItems(items);
  }, [items]);

  useEffect(() => {
    saveBudget(budget);
  }, [budget]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  const showToast = useCallback((msg: string) => setToast(msg), []);

  const upsertItem = useCallback(
    (item: ClosetItem, isNew: boolean) => {
      setItems((prev) => {
        const exists = prev.some((p) => p.id === item.id);
        if (exists) return prev.map((p) => (p.id === item.id ? item : p));
        return [item, ...prev];
      });
      showToast(isNew ? "Peça adicionada ao closet ✨" : "Peça atualizada com sucesso");
    },
    [showToast],
  );

  const deleteItem = useCallback(
    (id: string) => {
      setItems((prev) => prev.filter((i) => i.id !== id));
      showToast("Peça removida da lista");
    },
    [showToast],
  );

  const updateStatus = useCallback(
    (id: string, status: Status, extras?: Partial<ClosetItem>) => {
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, status, ...extras } : i)),
      );
      showToast(
        status === "Comprada"
          ? "Marcada como comprada"
          : status === "Esperando promoção"
            ? "Movida para esperando promoção"
            : status === "Desisti da compra"
              ? "Marcada como desistência"
              : "Status atualizado",
      );
    },
    [showToast],
  );

  const updateBudgetLimit = useCallback((monthlyLimit: number) => {
    setBudget({ monthlyLimit });
  }, []);

  const summary = useMemo(() => {
    const wishlist = items.filter(
      (i) => i.status === "Quero comprar" || i.status === "Esperando promoção",
    );
    const bought = items.filter((i) => i.status === "Comprada");
    const waiting = items.filter((i) => i.status === "Esperando promoção");
    const wishTotal = wishlist.reduce((s, i) => s + effectivePrice(i), 0);
    const spentTotal = bought.reduce(
      (s, i) => s + (i.paidPrice ?? effectivePrice(i)),
      0,
    );
    const savedTotal = items.reduce((s, i) => s + savings(i), 0);
    const monthSpent = bought
      .filter((i) => inCurrentMonth(i.purchasedAt))
      .reduce((s, i) => s + (i.paidPrice ?? effectivePrice(i)), 0);

    return {
      wantCount: wishlist.length,
      boughtCount: bought.length,
      wishTotal,
      spentTotal,
      savedTotal,
      waitingCount: waiting.length,
      monthSpent,
    };
  }, [items]);

  const countsByStatus = useMemo(() => {
    const base = {
      "Quero comprar": 0,
      "Esperando promoção": 0,
      Comprada: 0,
      "Desisti da compra": 0,
    };
    for (const item of items) base[item.status] += 1;
    return base;
  }, [items]);

  const brands = useMemo(
    () => [...new Set(items.map((i) => i.brand).filter(Boolean))].sort(),
    [items],
  );
  const stores = useMemo(
    () => [...new Set(items.map((i) => i.store).filter(Boolean))].sort(),
    [items],
  );
  const colors = useMemo(
    () => [...new Set(items.map((i) => i.color).filter(Boolean))].sort(),
    [items],
  );
  const sizes = useMemo(
    () => [...new Set(items.map((i) => i.size).filter(Boolean))].sort(),
    [items],
  );

  const filtered = useMemo(() => {
    let list = [...items];

    if (tab !== "Todas") list = list.filter((i) => i.status === tab);

    const q = filters.search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.brand.toLowerCase().includes(q) ||
          i.store.toLowerCase().includes(q),
      );
    }

    if (filters.category) list = list.filter((i) => i.category === filters.category);
    if (filters.brand) list = list.filter((i) => i.brand === filters.brand);
    if (filters.store) list = list.filter((i) => i.store === filters.store);
    if (filters.color) list = list.filter((i) => i.color === filters.color);
    if (filters.size) list = list.filter((i) => i.size === filters.size);
    if (filters.priority) list = list.filter((i) => i.priority === filters.priority);
    if (filters.status) list = list.filter((i) => i.status === filters.status);
    if (filters.promo === "com") list = list.filter((i) => hasPromo(i));
    if (filters.promo === "sem") list = list.filter((i) => !hasPromo(i));

    list = list.filter((i) => {
      const price = effectivePrice(i);
      if (!matchesPriceBand(price, filters.priceBand)) return false;
      const min = filters.minPrice ? Number(filters.minPrice) : null;
      const max = filters.maxPrice ? Number(filters.maxPrice) : null;
      if (min !== null && Number.isFinite(min) && price < min) return false;
      if (max !== null && Number.isFinite(max) && price > max) return false;
      return true;
    });

    list.sort((a, b) => {
      switch (sort) {
        case "menor-preco":
          return effectivePrice(a) - effectivePrice(b);
        case "maior-preco":
          return effectivePrice(b) - effectivePrice(a);
        case "maior-desconto":
          return discountPercent(b) - discountPercent(a);
        case "mais-desejados":
          return (priorityRank[b.priority] ?? 0) - (priorityRank[a.priority] ?? 0);
        case "antigos":
          return a.addedAt.localeCompare(b.addedAt);
        case "nome":
          return a.name.localeCompare(b.name, "pt-BR");
        case "marca":
          return a.brand.localeCompare(b.brand, "pt-BR");
        case "recentes":
        default:
          return b.addedAt.localeCompare(a.addedAt);
      }
    });

    return list;
  }, [items, filters, sort, tab]);

  const activeFilterChips = useMemo(() => {
    const chips: { key: keyof Filters; label: string }[] = [];
    const labels: Partial<Record<keyof Filters, string>> = {
      category: "Categoria",
      brand: "Marca",
      store: "Loja",
      color: "Cor",
      size: "Tamanho",
      priority: "Prioridade",
      status: "Status",
      promo: "Promoção",
      priceBand: "Faixa",
      minPrice: "Mín.",
      maxPrice: "Máx.",
      search: "Busca",
    };
    (Object.keys(filters) as (keyof Filters)[]).forEach((key) => {
      const val = filters[key];
      if (!val) return;
      const pretty =
        key === "promo"
          ? val === "com"
            ? "Com promoção"
            : "Sem promoção"
          : String(val);
      chips.push({ key, label: `${labels[key]}: ${pretty}` });
    });
    return chips;
  }, [filters]);

  return {
    items,
    filtered,
    summary,
    countsByStatus,
    budget,
    filters,
    setFilters,
    sort,
    setSort,
    view,
    setView,
    tab,
    setTab,
    toast,
    showToast,
    upsertItem,
    deleteItem,
    updateStatus,
    updateBudgetLimit,
    brands,
    stores,
    colors,
    sizes,
    activeFilterChips,
    clearFilters: () => setFilters(defaultFilters()),
  };
}
