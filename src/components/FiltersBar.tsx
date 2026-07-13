import { ChevronDown, LayoutGrid, List, X } from "lucide-react";
import { useState } from "react";
import { CATEGORIES, PRIORITIES, STATUSES } from "../types";
import type { Filters, SortOption, ViewMode } from "../types";

type Props = {
  filters: Filters;
  setFilters: (next: Filters | ((prev: Filters) => Filters)) => void;
  sort: SortOption;
  setSort: (v: SortOption) => void;
  view: ViewMode;
  setView: (v: ViewMode) => void;
  brands: string[];
  stores: string[];
  colors: string[];
  sizes: string[];
  activeChips: { key: keyof Filters; label: string }[];
  onClear: () => void;
};

const priceBands: { value: Filters["priceBand"]; label: string }[] = [
  { value: "", label: "Qualquer preço" },
  { value: "ate-50", label: "Até R$ 50" },
  { value: "50-100", label: "De R$ 50 a R$ 100" },
  { value: "100-200", label: "De R$ 100 a R$ 200" },
  { value: "200-300", label: "De R$ 200 a R$ 300" },
  { value: "300-500", label: "De R$ 300 a R$ 500" },
  { value: "500-1000", label: "De R$ 500 a R$ 1.000" },
  { value: "acima-1000", label: "Acima de R$ 1.000" },
];

export function FiltersBar({
  filters,
  setFilters,
  sort,
  setSort,
  view,
  setView,
  brands,
  stores,
  colors,
  sizes,
  activeChips,
  onClear,
}: Props) {
  const [open, setOpen] = useState(false);

  const patch = (partial: Partial<Filters>) =>
    setFilters((prev) => ({ ...prev, ...partial }));

  return (
    <section className="card-soft p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-ghost" onClick={() => setOpen((v) => !v)}>
          Filtros
          <ChevronDown size={16} className={`transition ${open ? "rotate-180" : ""}`} />
        </button>

        <label className="field min-w-[180px] flex-1">
          <span className="sr-only">Ordenar</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortOption)}>
            <option value="recentes">Adicionados recentemente</option>
            <option value="antigos">Adicionados há mais tempo</option>
            <option value="menor-preco">Menor preço</option>
            <option value="maior-preco">Maior preço</option>
            <option value="maior-desconto">Maior desconto</option>
            <option value="mais-desejados">Mais desejados</option>
            <option value="nome">Nome da peça</option>
            <option value="marca">Nome da marca</option>
          </select>
        </label>

        <div className="ml-auto flex gap-1 rounded-full border border-line p-1">
          <button
            type="button"
            className={`rounded-full p-2 ${view === "cards" ? "bg-rose text-white" : "text-muted"}`}
            onClick={() => setView("cards")}
            aria-label="Visualização em cards"
          >
            <LayoutGrid size={16} />
          </button>
          <button
            type="button"
            className={`rounded-full p-2 ${view === "lista" ? "bg-rose text-white" : "text-muted"}`}
            onClick={() => setView("lista")}
            aria-label="Visualização em lista"
          >
            <List size={16} />
          </button>
        </div>
      </div>

      {open ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="field">
            <span>Categoria</span>
            <select
              value={filters.category}
              onChange={(e) => patch({ category: e.target.value })}
            >
              <option value="">Todas</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Marca</span>
            <select value={filters.brand} onChange={(e) => patch({ brand: e.target.value })}>
              <option value="">Todas</option>
              {brands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Loja</span>
            <select value={filters.store} onChange={(e) => patch({ store: e.target.value })}>
              <option value="">Todas</option>
              {stores.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Cor</span>
            <select value={filters.color} onChange={(e) => patch({ color: e.target.value })}>
              <option value="">Todas</option>
              {colors.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Tamanho</span>
            <select value={filters.size} onChange={(e) => patch({ size: e.target.value })}>
              <option value="">Todos</option>
              {sizes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Prioridade</span>
            <select
              value={filters.priority}
              onChange={(e) => patch({ priority: e.target.value })}
            >
              <option value="">Todas</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Status</span>
            <select value={filters.status} onChange={(e) => patch({ status: e.target.value })}>
              <option value="">Todos</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Promoção</span>
            <select
              value={filters.promo}
              onChange={(e) => patch({ promo: e.target.value as Filters["promo"] })}
            >
              <option value="">Todas</option>
              <option value="com">Com promoção</option>
              <option value="sem">Sem promoção</option>
            </select>
          </label>
          <label className="field sm:col-span-2">
            <span>Faixa de preço</span>
            <select
              value={filters.priceBand}
              onChange={(e) =>
                patch({ priceBand: e.target.value as Filters["priceBand"] })
              }
            >
              {priceBands.map((b) => (
                <option key={b.value || "any"} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Preço mínimo</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={filters.minPrice}
              onChange={(e) => patch({ minPrice: e.target.value })}
              placeholder="0"
            />
          </label>
          <label className="field">
            <span>Preço máximo</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={filters.maxPrice}
              onChange={(e) => patch({ maxPrice: e.target.value })}
              placeholder="1000"
            />
          </label>
        </div>
      ) : null}

      {activeChips.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {activeChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className="inline-flex items-center gap-1 rounded-full bg-cream-deep px-3 py-1.5 text-xs text-brown-deep"
              onClick={() => patch({ [chip.key]: "" })}
            >
              {chip.label}
              <X size={12} />
            </button>
          ))}
          <button type="button" className="btn-ghost" onClick={onClear}>
            Limpar filtros
          </button>
        </div>
      ) : null}
    </section>
  );
}
