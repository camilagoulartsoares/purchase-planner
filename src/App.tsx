import { useMemo, useState } from "react";
import { Header } from "./components/Header";
import { SummaryCards } from "./components/SummaryCards";
import { BudgetPanel } from "./components/BudgetPanel";
import { StatusTabs } from "./components/StatusTabs";
import { FiltersBar } from "./components/FiltersBar";
import { ItemCard } from "./components/ItemCard";
import { ItemFormModal } from "./components/ItemFormModal";
import { PurchaseModal } from "./components/PurchaseModal";
import { EmptyState } from "./components/EmptyState";
import { Toast } from "./components/Toast";
import { useCloset } from "./hooks/useCloset";
import type { ClosetItem } from "./types";
import { defaultFilters } from "./types";

export default function App() {
  const closet = useCloset();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ClosetItem | null>(null);
  const [buying, setBuying] = useState<ClosetItem | null>(null);

  const hasActiveFilters = useMemo(() => {
    const base = defaultFilters();
    return (Object.keys(closet.filters) as (keyof typeof closet.filters)[]).some(
      (k) => closet.filters[k] !== base[k],
    );
  }, [closet.filters]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (item: ClosetItem) => {
    setEditing(item);
    setFormOpen(true);
  };

  const confirmDelete = (item: ClosetItem) => {
    const ok = window.confirm(`Excluir "${item.name}" da lista?`);
    if (ok) closet.deleteItem(item.id);
  };

  return (
    <div className="min-h-screen">
      <Header
        search={closet.filters.search}
        onSearch={(search) => closet.setFilters((f) => ({ ...f, search }))}
        onAdd={openCreate}
      />

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <SummaryCards summary={closet.summary} />
        <BudgetPanel
          budget={closet.budget}
          monthSpent={closet.summary.monthSpent}
          onChangeLimit={closet.updateBudgetLimit}
        />

        <section className="space-y-4">
          <StatusTabs
            tab={closet.tab}
            counts={closet.countsByStatus}
            onChange={closet.setTab}
          />

          <FiltersBar
            filters={closet.filters}
            setFilters={closet.setFilters}
            sort={closet.sort}
            setSort={closet.setSort}
            view={closet.view}
            setView={closet.setView}
            brands={closet.brands}
            stores={closet.stores}
            colors={closet.colors}
            sizes={closet.sizes}
            activeChips={closet.activeFilterChips}
            onClear={closet.clearFilters}
          />

          {closet.items.length === 0 ? (
            <EmptyState
              title="Seu closet ainda está vazio"
              description="Comece adicionando a primeira peça dos sonhos. Você pode salvar fotos, preços, lojas e acompanhar promoções."
              actionLabel="Adicionar nova peça"
              onAction={openCreate}
            />
          ) : closet.filtered.length === 0 ? (
            <EmptyState
              title="Nenhuma peça encontrada"
              description={
                hasActiveFilters
                  ? "Nenhum item corresponde aos filtros ou à busca atuais. Tente limpar os filtros."
                  : "Não há peças nesta aba no momento."
              }
              actionLabel={hasActiveFilters ? "Limpar filtros" : undefined}
              onAction={hasActiveFilters ? closet.clearFilters : undefined}
            />
          ) : closet.view === "cards" ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {closet.filtered.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  onEdit={openEdit}
                  onDelete={confirmDelete}
                  onBought={setBuying}
                  onWaitPromo={(i) =>
                    closet.updateStatus(i.id, "Esperando promoção")
                  }
                  onGiveUp={(i) => closet.updateStatus(i.id, "Desisti da compra")}
                />
              ))}
            </div>
          ) : (
            <div className="grid gap-3">
              {closet.filtered.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  compact
                  onEdit={openEdit}
                  onDelete={confirmDelete}
                  onBought={setBuying}
                  onWaitPromo={(i) =>
                    closet.updateStatus(i.id, "Esperando promoção")
                  }
                  onGiveUp={(i) => closet.updateStatus(i.id, "Desisti da compra")}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-line py-8 text-center text-sm text-muted">
        Meu Closet dos Sonhos · seus desejos, organizados com carinho
      </footer>

      <ItemFormModal
        open={formOpen}
        initial={editing}
        onClose={() => setFormOpen(false)}
        onSave={closet.upsertItem}
      />

      <PurchaseModal
        item={buying}
        onClose={() => setBuying(null)}
        onConfirm={(data) => {
          if (!buying) return;
          closet.updateStatus(buying.id, "Comprada", data);
          setBuying(null);
        }}
      />

      <Toast message={closet.toast} />
    </div>
  );
}
