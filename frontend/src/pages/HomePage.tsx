import { useCallback, useEffect, useState } from "react";
import {
  ExternalLink,
  LayoutGrid,
  List,
  LogOut,
  Pencil,
  ShoppingBag,
  Tag,
  Trash2,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import * as api from "../api/closet";
import { CATEGORIES, PRIORITIES, STATUSES, formatBRL, type Product, type Summary } from "../types";
import { ProductFormModal } from "../components/ProductFormModal";

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
  const { user, logout } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
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
      const [s, p] = await Promise.all([api.fetchSummary(), api.fetchProducts(query)]);
      setSummary(s);
      setItems(p.items);
      setMeta(p.meta);
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

  const onDelete = async (item: Product) => {
    if (!window.confirm(`Excluir "${item.name}"?`)) return;
    await api.deleteProduct(item.id);
    setToast("Peça removida");
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
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.16em] text-rose uppercase">Uso pessoal</p>
            <h1 className="font-display text-[clamp(2rem,5vw,3.2rem)] font-semibold text-brown-deep">
              Meu Closet dos Sonhos
            </h1>
            <p className="mt-1 max-w-xl text-sm text-muted">
              Tudo o que eu amo, desejo e escolho para o meu estilo.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted">Olá, {user?.name}</span>
            <button className="btn-ghost" onClick={logout}><LogOut size={14} /> Sair</button>
            <button className="btn-primary" onClick={() => { setEditing(null); setFormOpen(true); }}>
              + Adicionar peça
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
        {summary ? (
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
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

        <div className="flex gap-2 overflow-x-auto">
          {STATUSES.map((s) => (
            <button
              key={s}
              className={`shrink-0 rounded-full px-4 py-2 text-sm ${query.status === s ? "bg-rose text-white" : "border border-line bg-surface"}`}
              onClick={() => patch({ status: s })}
            >
              {s} <span className="opacity-70">{summary?.counts[s] ?? 0}</span>
            </button>
          ))}
        </div>

        <section className="card-soft space-y-3 p-4">
          <div className="flex flex-wrap gap-2">
            <input
              className="min-w-[200px] flex-1 rounded-full border border-line px-4 py-2 text-sm"
              placeholder="Buscar nome, marca ou loja"
              value={query.search}
              onChange={(e) => patch({ search: e.target.value })}
            />
            <select className="rounded-full border border-line px-3 py-2 text-sm" value={query.sort} onChange={(e) => patch({ sort: e.target.value })}>
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
              <button className={`rounded-full p-2 ${view === "cards" ? "bg-rose text-white" : ""}`} onClick={() => setView("cards")}><LayoutGrid size={16} /></button>
              <button className={`rounded-full p-2 ${view === "lista" ? "bg-rose text-white" : ""}`} onClick={() => setView("lista")}><List size={16} /></button>
            </div>
            <button className="btn-ghost" onClick={() => setQuery({ ...emptyQuery, status: query.status })}>Limpar filtros</button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <select className="rounded-xl border border-line px-3 py-2 text-sm" value={query.category} onChange={(e) => patch({ category: e.target.value })}>
              <option value="">Categoria</option>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <select className="rounded-xl border border-line px-3 py-2 text-sm" value={query.priority} onChange={(e) => patch({ priority: e.target.value })}>
              <option value="">Prioridade</option>
              {PRIORITIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <select className="rounded-xl border border-line px-3 py-2 text-sm" value={query.promo} onChange={(e) => patch({ promo: e.target.value })}>
              <option value="">Promoção</option>
              <option value="com">Com promoção</option>
              <option value="sem">Sem promoção</option>
            </select>
            <select className="rounded-xl border border-line px-3 py-2 text-sm" value={query.priceBand} onChange={(e) => patch({ priceBand: e.target.value })}>
              <option value="">Faixa de preço</option>
              <option value="ate-50">Até R$ 50</option>
              <option value="50-100">R$ 50 a 100</option>
              <option value="100-200">R$ 100 a 200</option>
              <option value="200-300">R$ 200 a 300</option>
              <option value="300-500">R$ 300 a 500</option>
              <option value="500-1000">R$ 500 a 1.000</option>
              <option value="acima-1000">Acima de R$ 1.000</option>
            </select>
            <input className="rounded-xl border border-line px-3 py-2 text-sm" placeholder="Preço mín." value={query.minPrice} onChange={(e) => patch({ minPrice: e.target.value })} />
            <input className="rounded-xl border border-line px-3 py-2 text-sm" placeholder="Preço máx." value={query.maxPrice} onChange={(e) => patch({ maxPrice: e.target.value })} />
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
              <article key={item.id} className={`card-soft overflow-hidden ${view === "lista" ? "grid gap-3 p-3 sm:grid-cols-[96px_1fr]" : ""}`}>
                <div className={view === "cards" ? "aspect-[4/5] bg-cream-deep" : "h-24 overflow-hidden rounded-xl bg-cream-deep"}>
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  ) : (
                    <div className="grid h-full place-items-center text-muted text-sm">Sem foto</div>
                  )}
                </div>
                <div className="space-y-2 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{item.category}</p>
                  <h3 className="font-display text-xl font-semibold text-brown-deep">{item.name}</h3>
                  <p className="text-sm text-muted">{item.brand} · {item.store}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {item.hasPromo ? (
                      <>
                        <span className="text-sm text-muted line-through">{formatBRL(item.originalPrice)}</span>
                        <span className="font-semibold text-rose">{formatBRL(item.promotionalPrice || 0)}</span>
                        <span className="rounded-full bg-rose/10 px-2 py-0.5 text-[10px] text-rose">-{item.discountPercent}%</span>
                      </>
                    ) : (
                      <span className="font-semibold text-brown-deep">{formatBRL(item.effectivePrice)}</span>
                    )}
                  </div>
                  <p className="text-xs text-muted">Cor: {item.color || "—"} · Tam: {item.size || "—"} · {item.priority}</p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {item.purchaseUrl ? (
                      <a className="btn-ghost" href={item.purchaseUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Comprar na loja</a>
                    ) : null}
                    <button className="btn-ghost" onClick={() => { setEditing(item); setFormOpen(true); }}><Pencil size={14} /> Editar</button>
                    <button className="btn-ghost" onClick={() => onStatus(item, "Já comprei")}><ShoppingBag size={14} /> Comprada</button>
                    <button className="btn-ghost" onClick={() => onStatus(item, "Esperando promoção")}><Tag size={14} /> Promoção</button>
                    <button className="btn-ghost" onClick={() => onStatus(item, "Desisti da compra")}>Desistir</button>
                    <button className="btn-ghost" onClick={() => onDelete(item)}><Trash2 size={14} /> Excluir</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {meta.totalPages > 1 ? (
          <div className="flex justify-center gap-2">
            <button className="btn-ghost" disabled={meta.page <= 1} onClick={() => patch({ page: meta.page - 1 })}>Anterior</button>
            <span className="px-3 py-2 text-sm text-muted">{meta.page} / {meta.totalPages}</span>
            <button className="btn-ghost" disabled={meta.page >= meta.totalPages} onClick={() => patch({ page: meta.page + 1 })}>Próxima</button>
          </div>
        ) : null}
      </main>

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
              <label className="field"><span>Preço pago</span><input value={paid} onChange={(e) => setPaid(e.target.value)} /></label>
              <label className="field"><span>Data</span><input type="date" value={buyDate} onChange={(e) => setBuyDate(e.target.value)} /></label>
              <label className="field"><span>Observação</span><textarea rows={2} value={buyNotes} onChange={(e) => setBuyNotes(e.target.value)} /></label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setBuying(null)}>Cancelar</button>
              <button className="btn-primary" onClick={() => void confirmBuy()}>Confirmar</button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="fixed right-4 bottom-4 z-50 rounded-2xl border border-line bg-surface px-4 py-3 text-sm shadow-lg">{toast}</div>
      ) : null}
    </div>
  );
}
