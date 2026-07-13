import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import * as api from "../api/closet";
import { AppShell } from "../components/AppShell";
import { ProductCard } from "../components/ProductCard";
import { ProductFormModal } from "../components/ProductFormModal";
import { formatBRL, PRIORITIES, STATUSES, PRICE_BANDS, type BrandSummary, type Product } from "../types";

export function BrandPage() {
  const { slug = "", category: categoryParam } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [brand, setBrand] = useState<BrandSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [buying, setBuying] = useState<Product | null>(null);
  const [paid, setPaid] = useState("");

  const category = categoryParam || searchParams.get("categoria") || "";
  const status = searchParams.get("status") || "";
  const priority = searchParams.get("prioridade") || "";
  const priceBand = searchParams.get("faixa") || "";
  const minPrice = searchParams.get("min") || "";
  const maxPrice = searchParams.get("max") || "";
  const sort = searchParams.get("ordem") || "recentes";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.fetchBrand(slug);
      setBrand(data);
    } catch {
      setBrand(null);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const products = useMemo(() => {
    if (!brand) return [];
    let list = [...brand.products];
    if (category) list = list.filter((p) => p.category === category);
    if (status) list = list.filter((p) => p.status === status);
    if (priority) list = list.filter((p) => p.priority === priority);
    if (minPrice) list = list.filter((p) => p.effectivePrice >= Number(minPrice));
    if (maxPrice) list = list.filter((p) => p.effectivePrice <= Number(maxPrice));
    if (priceBand) {
      const ranges: Record<string, { min?: number; max?: number }> = {
        "ate-50": { max: 50 },
        "50-100": { min: 50, max: 100 },
        "100-200": { min: 100, max: 200 },
        "200-300": { min: 200, max: 300 },
        "300-500": { min: 300, max: 500 },
        "500-1000": { min: 500, max: 1000 },
        "acima-1000": { min: 1000.01 },
      };
      const r = ranges[priceBand];
      if (r) {
        list = list.filter((p) => {
          if (r.min != null && p.effectivePrice < r.min) return false;
          if (r.max != null && p.effectivePrice > r.max) return false;
          return true;
        });
      }
    }
    list.sort((a, b) => {
      if (sort === "menor-preco") return a.effectivePrice - b.effectivePrice;
      if (sort === "maior-preco") return b.effectivePrice - a.effectivePrice;
      return a.name.localeCompare(b.name, "pt-BR");
    });
    return list;
  }, [brand, category, status, priority, priceBand, minPrice, maxPrice, sort]);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  };

  const goCategory = (cat: string) => {
    if (!cat) navigate(`/marcas/${slug}`);
    else navigate(`/marcas/${slug}/${encodeURIComponent(cat)}`);
  };

  if (loading) {
    return (
      <AppShell>
        <p className="text-muted">Carregando marca...</p>
      </AppShell>
    );
  }

  if (!brand) {
    return (
      <AppShell>
        <p className="text-muted">Marca não encontrada.</p>
        <Link className="btn-ghost mt-4 inline-flex" to="/marcas">
          Voltar às marcas
        </Link>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <nav className="mb-4 text-sm text-muted">
        <Link to="/marcas" className="text-rose hover:underline">
          Marcas
        </Link>
        <span className="mx-2">→</span>
        <span className="text-brown-deep">{brand.name}</span>
        {category ? (
          <>
            <span className="mx-2">→</span>
            <span className="text-brown-deep">{category}</span>
          </>
        ) : null}
      </nav>

      <div className="mb-6">
        <h1 className="font-display text-4xl font-semibold text-brown-deep">{brand.name}</h1>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="card-soft p-4">
            <p className="text-xs uppercase tracking-wide text-muted">Produtos</p>
            <p className="mt-1 text-2xl font-semibold">{brand.productCount}</p>
          </div>
          <div className="card-soft p-4">
            <p className="text-xs uppercase tracking-wide text-muted">Menor preço</p>
            <p className="mt-1 text-2xl font-semibold">{formatBRL(brand.minPrice)}</p>
          </div>
          <div className="card-soft p-4">
            <p className="text-xs uppercase tracking-wide text-muted">Maior preço</p>
            <p className="mt-1 text-2xl font-semibold">{formatBRL(brand.maxPrice)}</p>
          </div>
          <div className="card-soft p-4">
            <p className="text-xs uppercase tracking-wide text-muted">Valor total</p>
            <p className="mt-1 text-2xl font-semibold">{formatBRL(brand.totalValue)}</p>
          </div>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <button
          type="button"
          className={`rounded-full px-3 py-1.5 text-sm ${!category ? "bg-rose text-white" : "bg-cream-deep text-brown-deep"}`}
          onClick={() => goCategory("")}
        >
          Todos
        </button>
        {brand.categories.map((cat) => (
          <button
            key={cat}
            type="button"
            className={`rounded-full px-3 py-1.5 text-sm ${
              category === cat ? "bg-rose text-white" : "bg-cream-deep text-brown-deep"
            }`}
            onClick={() => goCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="field">
          <span>Status</span>
          <select value={status} onChange={(e) => setFilter("status", e.target.value)}>
            <option value="">Todos</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Prioridade</span>
          <select value={priority} onChange={(e) => setFilter("prioridade", e.target.value)}>
            <option value="">Todas</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Faixa de preço</span>
          <select value={priceBand} onChange={(e) => setFilter("faixa", e.target.value)}>
            {PRICE_BANDS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Preço mín.</span>
          <input value={minPrice} onChange={(e) => setFilter("min", e.target.value)} placeholder="0" />
        </label>
        <label className="field">
          <span>Preço máx.</span>
          <input value={maxPrice} onChange={(e) => setFilter("max", e.target.value)} placeholder="1000" />
        </label>
        <label className="field">
          <span>Ordenar</span>
          <select value={sort} onChange={(e) => setFilter("ordem", e.target.value)}>
            <option value="recentes">Nome</option>
            <option value="menor-preco">Menor preço</option>
            <option value="maior-preco">Maior preço</option>
          </select>
        </label>
      </div>

      {products.length === 0 ? (
        <p className="text-muted">Nenhum produto com esses filtros.</p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onEdit={(p) => {
                setEditing(p);
                setFormOpen(true);
              }}
              onMarkBought={(p) => {
                setBuying(p);
                setPaid(String(p.effectivePrice));
              }}
            />
          ))}
        </div>
      )}

      <ProductFormModal
        open={formOpen}
        initial={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSave={async (form, id) => {
          await api.saveProduct(form, id);
          await load();
        }}
      />

      {buying ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4">
          <div className="card-soft w-full max-w-md p-6">
            <h3 className="font-display text-2xl">Marcar como comprada</h3>
            <label className="field mt-4">
              <span>Valor pago</span>
              <input value={paid} onChange={(e) => setPaid(e.target.value)} />
            </label>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="btn-primary"
                onClick={async () => {
                  await api.patchStatus(buying.id, {
                    status: "Já comprei",
                    purchasedPrice: Number(paid),
                  });
                  setBuying(null);
                  await load();
                }}
              >
                Confirmar
              </button>
              <button type="button" className="btn-ghost" onClick={() => setBuying(null)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
