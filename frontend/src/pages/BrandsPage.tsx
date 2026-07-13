import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import * as api from "../api/closet";
import { AppShell } from "../components/AppShell";
import { formatBRL, type BrandSummary } from "../types";

export function BrandsPage() {
  const [brands, setBrands] = useState<BrandSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        setBrands(await api.fetchBrands());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <AppShell>
      <div className="mb-8">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-rose uppercase">Explorar</p>
        <h1 className="font-display mt-1 text-4xl font-semibold text-brown-deep">Marcas</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Veja as marcas com peças cadastradas e entre em cada uma para filtrar por categoria.
        </p>
      </div>

      {loading ? (
        <p className="text-muted">Carregando marcas...</p>
      ) : brands.length === 0 ? (
        <p className="text-muted">Nenhuma marca com produtos ainda. Cadastre uma peça para começar.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {brands.map((brand) => (
            <Link
              key={brand.id}
              to={`/marcas/${brand.slug}`}
              className="card-soft block p-5 transition hover:-translate-y-0.5 hover:border-rose/40"
            >
              <h2 className="font-display text-2xl font-semibold text-brown-deep">{brand.name}</h2>
              <p className="mt-2 text-sm text-muted">
                {brand.productCount} {brand.productCount === 1 ? "produto" : "produtos"}
              </p>
              <p className="mt-1 text-sm text-muted">
                {formatBRL(brand.minPrice)} — {formatBRL(brand.maxPrice)}
              </p>
              {brand.categories.length ? (
                <p className="mt-3 text-xs tracking-wide text-rose uppercase">
                  {brand.categories.join(" · ")}
                </p>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
