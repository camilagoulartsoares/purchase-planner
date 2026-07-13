import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { Plus, X } from "lucide-react";
import * as api from "../api/closet";
import { AppShell } from "../components/AppShell";
import { BrandsSkeleton } from "../components/Skeletons";
import { formatBRL, mediaUrl, type BrandSummary } from "../types";

export function BrandsPage() {
  const [brands, setBrands] = useState<BrandSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [logo, setLogo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setBrands(await api.fetchBrands());
  };

  useEffect(() => {
    void (async () => {
      try {
        await load();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const openModal = () => {
    setName("");
    setLogo(null);
    setPreview(null);
    setError("");
    setModalOpen(true);
  };

  const onLogo = (file?: File | null) => {
    if (!file) {
      setLogo(null);
      setPreview(null);
      return;
    }
    setLogo(file);
    setPreview(URL.createObjectURL(file));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Informe o nome da marca.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("name", name.trim());
      if (logo) fd.append("logo", logo);
      await api.createBrand(fd);
      await load();
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível criar a marca.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-rose uppercase">Explorar</p>
          <h1 className="font-display mt-1 text-4xl font-semibold text-brown-deep">Marcas</h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Veja as marcas cadastradas e entre em cada uma para filtrar por categoria.
          </p>
        </div>
        <button type="button" className="btn-primary inline-flex items-center gap-2" onClick={openModal}>
          <Plus size={16} />
          Adicionar marca
        </button>
      </div>

      {loading ? (
        <BrandsSkeleton />
      ) : brands.length === 0 ? (
        <p className="text-muted">Nenhuma marca ainda. Adicione a primeira marca para começar.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {brands.map((brand) => (
            <Link
              key={brand.id}
              to={`/marcas/${brand.slug}`}
              className="card-soft block p-5 transition hover:-translate-y-0.5 hover:border-rose/40"
            >
              {brand.logoUrl ? (
                <div className="mb-4 flex h-14 items-center">
                  <img
                    src={mediaUrl(brand.logoUrl)}
                    alt={`Logo ${brand.name}`}
                    className="max-h-14 max-w-[160px] object-contain object-left"
                  />
                </div>
              ) : null}
              <h2 className="font-display text-2xl font-semibold text-brown-deep">{brand.name}</h2>
              <p className="mt-2 text-sm text-muted">
                {brand.productCount} {brand.productCount === 1 ? "produto" : "produtos"}
              </p>
              {brand.productCount > 0 ? (
                <p className="mt-1 text-sm text-muted">
                  {formatBRL(brand.minPrice)} — {formatBRL(brand.maxPrice)}
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted">Sem peças ainda</p>
              )}
              {brand.categories.length ? (
                <p className="mt-3 text-xs tracking-wide text-rose uppercase">
                  {brand.categories.join(" · ")}
                </p>
              ) : null}
            </Link>
          ))}
        </div>
      )}

      {modalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <form onSubmit={submit} className="card-soft w-full max-w-md p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-2xl font-semibold text-brown-deep">Nova marca</h2>
              <button type="button" className="btn-ghost" onClick={() => setModalOpen(false)} aria-label="Fechar">
                <X size={16} />
              </button>
            </div>
            <div className="grid gap-3">
              <label className="field">
                <span>Nome</span>
                <input value={name} onChange={(e) => setName(e.target.value)} required />
              </label>
              <label className="field">
                <span>Logo (opcional)</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => onLogo(e.target.files?.[0] || null)}
                />
              </label>
              {preview ? (
                <img src={preview} alt="" className="h-16 max-w-[180px] object-contain object-left" />
              ) : null}
              {error ? <p className="text-sm text-rose-deep">{error}</p> : null}
              <div className="mt-2 flex gap-2">
                <button className="btn-primary" disabled={saving}>
                  {saving ? "Salvando..." : "Salvar marca"}
                </button>
                <button type="button" className="btn-ghost" onClick={() => setModalOpen(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}
    </AppShell>
  );
}
