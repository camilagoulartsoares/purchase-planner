import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Check, ChevronDown, Gem, Heart, PiggyBank, SlidersHorizontal, Sparkles } from "lucide-react";
import * as api from "../api/closet";
import {
  CATEGORIES,
  STATUSES,
  formatBRL,
  type BrandSummary,
  type Product,
  type Summary,
} from "../types";
import { ProductFormModal } from "../components/ProductFormModal";
import { ProductCard } from "../components/ProductCard";
import { AppShell } from "../components/AppShell";
import { HomeSkeleton, ProductGridSkeleton } from "../components/Skeletons";

const emptyQuery = {
  search: "",
  category: "",
  brand: "",
  store: "",
  color: "",
  size: "",
  priority: "",
  status: "Quero comprar",
  favorite: false,
  promo: "",
  minPrice: "",
  maxPrice: "",
  sort: "recentes",
  page: 1,
  perPage: 12,
};

const VISIBLE_STATUSES = STATUSES.filter((s) => s !== "Esperando promoção");
const MIN_FILTER_PRICE = 0;
const MAX_FILTER_PRICE = 2000;
const PRICE_STEP = 10;
const DEFAULT_BUDGET = 400;

const priorityScore: Record<string, number> = {
  "Quero muito": 3,
  Quero: 2,
  Talvez: 1,
};

function SelectField({
  value,
  onChange,
  options,
  label,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  label: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) || options[0];

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className={`select-pretty ${className}`} ref={ref}>
      <span>{label}</span>
      <button
        type="button"
        className="select-pretty-trigger"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{selected?.label}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open ? (
        <div className="select-pretty-menu" role="listbox">
          {options.map((option) => (
            <button
              key={option.value || "all"}
              type="button"
              className={`select-pretty-option ${option.value === value ? "is-selected" : ""}`}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              role="option"
              aria-selected={option.value === value}
            >
              <span>{option.label}</span>
              {option.value === value ? <Check size={14} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function HomePage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [brands, setBrands] = useState<BrandSummary[]>([]);
  const [items, setItems] = useState<Product[]>([]);
  const [plannerItems, setPlannerItems] = useState<Product[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, perPage: 12, totalPages: 1 });
  const [query, setQuery] = useState(emptyQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(emptyQuery);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [buying, setBuying] = useState<Product | null>(null);
  const [paid, setPaid] = useState("");
  const [buyDate, setBuyDate] = useState(new Date().toISOString().slice(0, 10));
  const [buyNotes, setBuyNotes] = useState("");
  const [monthlyBudget, setMonthlyBudget] = useState(() => {
    const stored = window.localStorage.getItem("purchase-planner-budget");
    return stored ? Number(stored) || DEFAULT_BUDGET : DEFAULT_BUDGET;
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const fetchPlannerItems = async () => {
        const first = await api.fetchProducts({ ...debouncedQuery, page: 1, perPage: 50 });
        if (first.meta.totalPages <= 1) return first.items;

        const rest = await Promise.all(
          Array.from({ length: first.meta.totalPages - 1 }, (_, index) =>
            api.fetchProducts({ ...debouncedQuery, page: index + 2, perPage: 50 }),
          ),
        );

        return [...first.items, ...rest.flatMap((page) => page.items)];
      };

      const [s, p, b, plannerProducts] = await Promise.all([
        api.fetchSummary(),
        api.fetchProducts(debouncedQuery),
        api.fetchBrands(),
        fetchPlannerItems(),
      ]);
      setSummary(s);
      setItems(p.items);
      setPlannerItems(plannerProducts);
      setMeta(p.meta);
      setBrands(b);
    } catch {
      setToast("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    window.localStorage.setItem("purchase-planner-budget", String(monthlyBudget));
  }, [monthlyBudget]);

  const patch = (partial: Partial<typeof query>) =>
    setQuery((q) => ({ ...q, ...partial, page: partial.page ?? 1 }));

  const priceMin = query.minPrice === "" ? MIN_FILTER_PRICE : Number(query.minPrice);
  const priceMax = query.maxPrice === "" ? MAX_FILTER_PRICE : Number(query.maxPrice);

  const setPriceMin = (value: number) => {
    const next = Math.min(value, priceMax - PRICE_STEP);
    patch({ minPrice: next <= MIN_FILTER_PRICE ? "" : String(next) });
  };

  const setPriceMax = (value: number) => {
    const next = Math.max(value, priceMin + PRICE_STEP);
    patch({ maxPrice: next >= MAX_FILTER_PRICE ? "" : String(next) });
  };

  const priceStart = ((priceMin - MIN_FILTER_PRICE) / (MAX_FILTER_PRICE - MIN_FILTER_PRICE)) * 100;
  const priceEnd = ((priceMax - MIN_FILTER_PRICE) / (MAX_FILTER_PRICE - MIN_FILTER_PRICE)) * 100;

  const planner = useMemo(() => {
    const wanted = plannerItems.filter((item) => item.status !== "Já comprei" && item.status !== "Desisti da compra");
    const total = wanted.reduce((sum, item) => sum + item.effectivePrice, 0);
    const onBudget = wanted
      .filter((item) => item.effectivePrice <= monthlyBudget)
      .sort((a, b) => {
        const aScore =
          (priorityScore[a.priority] || 0) * 100 +
          a.discountPercent * 2 +
          (a.isFavorite ? 25 : 0) -
          a.effectivePrice / 30;
        const bScore =
          (priorityScore[b.priority] || 0) * 100 +
          b.discountPercent * 2 +
          (b.isFavorite ? 25 : 0) -
          b.effectivePrice / 30;
        return bScore - aScore;
      });
    const topPick = onBudget[0] || null;
    const cheapest = wanted.length
      ? wanted.reduce((current, item) =>
          item.effectivePrice < current.effectivePrice ? item : current,
        )
      : null;
    const budgetUse = monthlyBudget > 0 ? Math.min(100, (total / monthlyBudget) * 100) : 100;

    return {
      wantedCount: wanted.length,
      total,
      topPick,
      cheapest,
      budgetUse,
      withinBudgetCount: onBudget.length,
    };
  }, [plannerItems, monthlyBudget]);

  const resetFilters = () => setQuery({ ...emptyQuery, status: query.status });
  const sortOptions = [
    { value: "recentes", label: "Mais recentes" },
    { value: "antigos", label: "Mais antigos" },
    { value: "menor-preco", label: "Menor preço" },
    { value: "maior-preco", label: "Maior preço" },
    { value: "maior-desconto", label: "Maior desconto" },
    { value: "nome", label: "Nome" },
    { value: "marca", label: "Marca" },
  ];
  const brandOptions = [
    { value: "", label: "Todas" },
    ...brands.map((brand) => ({ value: brand.name, label: brand.name })),
  ];
  const categoryOptions = [
    { value: "", label: "Todas" },
    ...CATEGORIES.map((category) => ({ value: category, label: category })),
  ];

  const onSave = async (form: FormData, id?: string) => {
    await api.saveProduct(form, id);
    setToast(id ? "Peça atualizada" : "Peça adicionada");
    await load();
  };

  const onStatus = async (item: Product, status: string) => {
    if (status === "Já comprei") {
      setBuying(item);
      setPaid(String(item.effectivePrice));
      return;
    }
    await api.patchStatus(item.id, { status });
    setToast("Status atualizado");
    await load();
  };

  const confirmBuy = async () => {
    if (!buying) return;
    await api.patchStatus(buying.id, {
      status: "Já comprei",
      purchasedPrice: Number(paid),
      purchasedAt: buyDate,
      notes: buyNotes || undefined,
    });
    setBuying(null);
    setToast("Registrada como comprada");
    await load();
  };

  return (
    <AppShell
      actions={
        <button
          className="btn-primary"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          + Adicionar peça
        </button>
      }
    >
      {loading && !summary ? (
        <HomeSkeleton />
      ) : (
        <>
      {summary ? (
        <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Desejados", String(summary.wantCount)],
            ["Comprados", String(summary.boughtCount)],
            ["Total desejos", formatBRL(summary.wishTotal)],
            ["Total gasto", formatBRL(summary.spentTotal)],
          ].map(([label, value]) => (
            <article key={label} className="card-soft p-4">
              <p className="text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">{label}</p>
              <p className="font-display mt-1 text-2xl font-semibold text-brown-deep">{value}</p>
            </article>
          ))}
        </section>
      ) : null}

      <section className="planner-panel mb-6">
        <div className="planner-panel-main">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="planner-kicker">
                <Sparkles size={15} /> Planejador inteligente
              </p>
              <h2 className="font-display mt-2 text-3xl font-semibold text-brown-deep">
                {planner.topPick
                  ? "A compra que mais faz sentido agora"
                  : `Nada até ${formatBRL(monthlyBudget)}`}
              </h2>
            </div>
            <div className="planner-budget-control">
              <label htmlFor="monthly-budget">Orçamento</label>
              <input
                id="monthly-budget"
                type="text"
                inputMode="numeric"
                value={String(monthlyBudget)}
                onChange={(event) => {
                  const digits = event.target.value.replace(/\D/g, "");
                  const normalized = digits.replace(/^0+(?=\d)/, "");
                  setMonthlyBudget(normalized ? Number(normalized) : 0);
                }}
              />
            </div>
          </div>

          {planner.topPick ? (
            <div className="planner-pick">
              <div>
                <p className="text-xs font-semibold tracking-[0.1em] text-muted uppercase">
                  {planner.topPick.brand} · {planner.topPick.category}
                </p>
                <p className="mt-1 text-xl font-semibold text-ink">{planner.topPick.name}</p>
                <p className="mt-1 text-sm text-muted">
                  {planner.topPick.priority} por {formatBRL(planner.topPick.effectivePrice)}
                  {planner.topPick.discountPercent > 0
                    ? `, com ${planner.topPick.discountPercent}% de desconto`
                    : ""}
                </p>
              </div>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setBuying(planner.topPick);
                  setPaid(String(planner.topPick.effectivePrice));
                }}
              >
                Registrar compra
              </button>
            </div>
          ) : (
            <p className="mt-5 text-sm text-muted">
              {planner.cheapest
                ? `A peça mais barata da lista custa ${formatBRL(planner.cheapest.effectivePrice)}. Aumente o orçamento para ver uma sugestão.`
                : "Quando houver peças na lista, este painel aponta a melhor compra dentro do seu orçamento."}
            </p>
          )}
        </div>

        <div className="planner-panel-side">
          <article>
            <span><PiggyBank size={16} /> Lista atual</span>
            <strong>{formatBRL(planner.total)}</strong>
            <div className="planner-meter" aria-hidden="true">
              <span style={{ width: `${planner.budgetUse}%` }} />
            </div>
          </article>
          <article>
            <span><Gem size={16} /> Cabem no orçamento</span>
            <strong>
              {planner.withinBudgetCount} de {planner.wantedCount}
            </strong>
            <small>
              {planner.withinBudgetCount > 0
                ? `Até ${formatBRL(monthlyBudget)}, com base na lista atual`
                : `Nenhuma peça até ${formatBRL(monthlyBudget)}`}
            </small>
          </article>
        </div>
      </section>

      <div className="mb-4 flex gap-2 overflow-x-auto">
        {VISIBLE_STATUSES.map((s) => (
          <button
            key={s}
            className={`shrink-0 rounded-full px-4 py-2 text-sm ${
              query.status === s ? "bg-rose text-white" : "border border-line bg-surface"
            }`}
            onClick={() => patch({ status: s })}
          >
            {s} <span className="opacity-70">{summary?.counts[s] ?? 0}</span>
          </button>
        ))}
      </div>

      <section className="card-soft mb-6 space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="filter-input min-w-[220px] flex-1"
            placeholder="Buscar nome, marca ou loja"
            value={query.search}
            onChange={(e) => patch({ search: e.target.value })}
          />
          <SelectField
            label="Ordenar"
            value={query.sort}
            onChange={(sort) => patch({ sort })}
            options={sortOptions}
            className="min-w-[160px]"
          />
          <button
            type="button"
            className={`btn-ghost ${query.favorite ? "filter-chip-active" : ""}`}
            onClick={() => patch({ favorite: !query.favorite })}
            aria-pressed={query.favorite}
          >
            <Heart size={14} className={query.favorite ? "fill-white" : ""} />
            Favoritos
          </button>
          <button
            className="btn-ghost"
            onClick={resetFilters}
          >
            Limpar filtros
          </button>
        </div>
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1.5fr]">
          <SelectField
            label="Marca"
            value={query.brand}
            onChange={(brand) => patch({ brand })}
            options={brandOptions}
          />
          <SelectField
            label="Categoria"
            value={query.category}
            onChange={(category) => patch({ category })}
            options={categoryOptions}
          />
          <div className="price-filter">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                <SlidersHorizontal size={14} /> Preço
              </span>
              <strong className="text-sm text-brown-deep">
                {formatBRL(priceMin)} - {priceMax >= MAX_FILTER_PRICE ? `+${formatBRL(MAX_FILTER_PRICE)}` : formatBRL(priceMax)}
              </strong>
            </div>
            <div
              className="range-wrap"
              style={
                {
                  "--range-start": `${priceStart}%`,
                  "--range-end": `${priceEnd}%`,
                } as CSSProperties
              }
            >
              <input
                type="range"
                min={MIN_FILTER_PRICE}
                max={MAX_FILTER_PRICE}
                step={PRICE_STEP}
                value={priceMin}
                onChange={(e) => setPriceMin(Number(e.target.value))}
                aria-label="Preço mínimo"
              />
              <input
                type="range"
                min={MIN_FILTER_PRICE}
                max={MAX_FILTER_PRICE}
                step={PRICE_STEP}
                value={priceMax}
                onChange={(e) => setPriceMax(Number(e.target.value))}
                aria-label="Preço máximo"
              />
            </div>
            <div className="mt-2 flex justify-between text-[11px] font-semibold text-muted">
              <span>{formatBRL(MIN_FILTER_PRICE)}</span>
              <span>{formatBRL(MAX_FILTER_PRICE)}+</span>
            </div>
            <div className="price-values">
              <span>Min. {formatBRL(priceMin)}</span>
              <span>Max. {priceMax >= MAX_FILTER_PRICE ? `${formatBRL(MAX_FILTER_PRICE)}+` : formatBRL(priceMax)}</span>
            </div>
          </div>
        </div>
      </section>

      {loading ? (
        <ProductGridSkeleton />
      ) : items.length === 0 ? (
        <div className="card-soft py-16 text-center">
          <p className="font-display text-2xl text-brown-deep">Nenhuma peça por aqui</p>
          <p className="mt-2 text-sm text-muted">Adicione algo quando quiser, no seu ritmo.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <ProductCard
              key={item.id}
              product={item}
              onEdit={(p) => {
                setEditing(p);
                setFormOpen(true);
              }}
              onMarkBought={(p) => void onStatus(p, "Já comprei")}
              onFavorite={async (p) => {
                setItems((current) =>
                  current.map((item) =>
                    item.id === p.id ? { ...item, isFavorite: !item.isFavorite } : item,
                  ),
                );
                await api.toggleFavorite(p.id);
                setToast(p.isFavorite ? "Removida dos favoritos" : "Adicionada aos favoritos");
                await load();
              }}
              onStatus={(p, status) => void onStatus(p, status)}
              onDelete={async (p) => {
                if (!window.confirm(`Excluir definitivamente "${p.name}"?`)) return;
                await api.deleteProduct(p.id);
                setToast("Peça removida");
                await load();
              }}
            />
          ))}
        </div>
      )}

      {meta.totalPages > 1 ? (
        <div className="mt-6 flex justify-center gap-2">
          <button
            className="btn-ghost"
            disabled={meta.page <= 1}
            onClick={() => patch({ page: meta.page - 1 })}
          >
            Anterior
          </button>
          <span className="px-3 py-2 text-sm text-muted">
            {meta.page} / {meta.totalPages}
          </span>
          <button
            className="btn-ghost"
            disabled={meta.page >= meta.totalPages}
            onClick={() => patch({ page: meta.page + 1 })}
          >
            Próxima
          </button>
        </div>
      ) : null}

      <ProductFormModal
        open={formOpen}
        initial={editing}
        onClose={() => setFormOpen(false)}
        onSave={onSave}
      />

      {buying ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-brown-deep/35 p-4">
          <div className="card-soft w-full max-w-md p-5">
            <h3 className="font-display text-2xl text-brown-deep">Registrar compra</h3>
            <p className="mt-1 text-sm text-muted">{buying.name}</p>
            <div className="mt-4 grid gap-3">
              <label className="field">
                <span>Preço pago</span>
                <input value={paid} onChange={(e) => setPaid(e.target.value)} />
              </label>
              <label className="field">
                <span>Data</span>
                <input type="date" value={buyDate} onChange={(e) => setBuyDate(e.target.value)} />
              </label>
              <label className="field">
                <span>Observação</span>
                <textarea rows={2} value={buyNotes} onChange={(e) => setBuyNotes(e.target.value)} />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setBuying(null)}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={() => void confirmBuy()}>
                Confirmar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="fixed right-4 bottom-4 z-50 rounded-2xl border border-line bg-surface px-4 py-3 text-sm shadow-lg">
          {toast}
        </div>
      ) : null}
        </>
      )}
    </AppShell>
  );
}
