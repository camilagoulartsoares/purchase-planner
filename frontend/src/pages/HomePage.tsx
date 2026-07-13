import { useCallback, useEffect, useState } from "react";
import { LayoutGrid, List } from "lucide-react";
import * as api from "../api/closet";
import {
  CATEGORIES,
  PRIORITIES,
  STATUSES,
  PRICE_BANDS,
  formatBRL,
  type BrandSummary,
  type Product,
  type Summary,
} from "../types";
import { ProductFormModal } from "../components/ProductFormModal";
import { ProductCard } from "../components/ProductCard";
import { AppShell } from "../components/AppShell";

const emptyQuery = {
  search: "",
  category: "",
  brand: "",
  store: "",
  color: "",
  size: "",
  priority: "",
  status: "Quero comprar",
  promo: "",
  minPrice: "",
  maxPrice: "",
  priceBand: "",
  sort: "recentes",
  page: 1,
  perPage: 12,
};

export function HomePage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [brands, setBrands] = useState<BrandSummary[]>([]);
  const [items, setItems] = useState<Product[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, perPage: 12, totalPages: 1 });
  const [query, setQuery] = useState(emptyQuery);
  const [view, setView] = useState<"cards" | "lista">("cards");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [buying, setBuying] = useState<Product | null>(null);
  const [paid, setPaid] = useState("");
  const [buyDate, setBuyDate] = useState(new Date().toISOString().slice(0, 10));
  const [buyNotes, setBuyNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p, b] = await Promise.all([
        api.fetchSummary(),
        api.fetchProducts(query),
        api.fetchBrands(),
      ]);
      setSummary(s);
      setItems(p.items);
      setMeta(p.meta);
      setBrands(b);
    } catch {
      setToast("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const patch = (partial: Partial<typeof query>) =>
    setQuery((q) => ({ ...q, ...partial, page: partial.page ?? 1 }));

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
      {summary ? (
        <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {[
            ["Desejados", String(summary.wantCount)],
            ["Comprados", String(summary.boughtCount)],
            ["Total desejos", formatBRL(summary.wishTotal)],
            ["Total gasto", formatBRL(summary.spentTotal)],
            ["Economizado", formatBRL(summary.savedTotal)],
            ["Esperando promoção", String(summary.waitingCount)],
          ].map(([label, value]) => (
            <article key={label} className="card-soft p-4">
              <p className="text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">{label}</p>
              <p className="font-display mt-1 text-2xl font-semibold text-brown-deep">{value}</p>
            </article>
          ))}
        </section>
      ) : null}

      <div className="mb-4 flex gap-2 overflow-x-auto">
        {STATUSES.map((s) => (
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

      <section className="card-soft mb-6 space-y-3 p-4">
        <div className="flex flex-wrap gap-2">
          <input
            className="min-w-[200px] flex-1 rounded-full border border-line px-4 py-2 text-sm"
            placeholder="Buscar nome, marca ou loja"
            value={query.search}
            onChange={(e) => patch({ search: e.target.value })}
          />
          <select
            className="rounded-full border border-line px-3 py-2 text-sm"
            value={query.sort}
            onChange={(e) => patch({ sort: e.target.value })}
          >
            <option value="recentes">Mais recentes</option>
            <option value="antigos">Mais antigos</option>
            <option value="menor-preco">Menor preço</option>
            <option value="maior-preco">Maior preço</option>
            <option value="maior-desconto">Maior desconto</option>
            <option value="prioridade">Prioridade</option>
            <option value="nome">Nome</option>
            <option value="marca">Marca</option>
          </select>
          <div className="flex rounded-full border border-line p-1">
            <button
              className={`rounded-full p-2 ${view === "cards" ? "bg-rose text-white" : ""}`}
              onClick={() => setView("cards")}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              className={`rounded-full p-2 ${view === "lista" ? "bg-rose text-white" : ""}`}
              onClick={() => setView("lista")}
            >
              <List size={16} />
            </button>
          </div>
          <button
            className="btn-ghost"
            onClick={() => setQuery({ ...emptyQuery, status: query.status })}
          >
            Limpar filtros
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <select
            className="rounded-xl border border-line px-3 py-2 text-sm"
            value={query.brand}
            onChange={(e) => patch({ brand: e.target.value })}
          >
            <option value="">Marca</option>
            {brands.map((b) => (
              <option key={b.id} value={b.name}>
                {b.name}
              </option>
            ))}
          </select>
          <select
            className="rounded-xl border border-line px-3 py-2 text-sm"
            value={query.category}
            onChange={(e) => patch({ category: e.target.value })}
          >
            <option value="">Categoria</option>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select
            className="rounded-xl border border-line px-3 py-2 text-sm"
            value={query.priority}
            onChange={(e) => patch({ priority: e.target.value })}
          >
            <option value="">Prioridade</option>
            {PRIORITIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select
            className="rounded-xl border border-line px-3 py-2 text-sm"
            value={query.priceBand}
            onChange={(e) => patch({ priceBand: e.target.value })}
          >
            {PRICE_BANDS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
          <input
            className="rounded-xl border border-line px-3 py-2 text-sm"
            placeholder="Preço mín."
            value={query.minPrice}
            onChange={(e) => patch({ minPrice: e.target.value })}
          />
          <input
            className="rounded-xl border border-line px-3 py-2 text-sm"
            placeholder="Preço máx."
            value={query.maxPrice}
            onChange={(e) => patch({ maxPrice: e.target.value })}
          />
        </div>
      </section>

      {loading ? (
        <p className="py-16 text-center text-muted">Carregando...</p>
      ) : items.length === 0 ? (
        <div className="card-soft py-16 text-center">
          <p className="font-display text-2xl text-brown-deep">Nenhuma peça por aqui</p>
          <p className="mt-2 text-sm text-muted">Adicione algo quando quiser, no seu ritmo.</p>
        </div>
      ) : (
        <div className={view === "cards" ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3" : "grid gap-3"}>
          {items.map((item) => (
            <ProductCard
              key={item.id}
              product={item}
              onEdit={(p) => {
                setEditing(p);
                setFormOpen(true);
              }}
              onMarkBought={(p) => void onStatus(p, "Já comprei")}
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
    </AppShell>
  );
}
