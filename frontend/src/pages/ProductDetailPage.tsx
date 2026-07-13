import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ExternalLink, Pencil } from "lucide-react";
import * as api from "../api/closet";
import { AppShell } from "../components/AppShell";
import { ProductGallery } from "../components/ProductGallery";
import { ProductFormModal } from "../components/ProductFormModal";
import { formatBRL, type Product } from "../types";

export function ProductDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setProduct(await api.fetchProduct(id));
    } catch {
      setProduct(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  if (loading) {
    return (
      <AppShell>
        <p className="text-muted">Carregando peça...</p>
      </AppShell>
    );
  }

  if (!product) {
    return (
      <AppShell>
        <p className="text-muted">Produto não encontrado.</p>
        <Link className="btn-ghost mt-4 inline-flex" to="/">
          Voltar
        </Link>
      </AppShell>
    );
  }

  const images =
    product.images?.length
      ? product.images
      : product.imageUrl
        ? [{ imageUrl: product.imageUrl }]
        : [];

  const buyLabel = product.brand ? `Comprar na ${product.brand}` : "Comprar na loja";

  return (
    <AppShell>
      <nav className="mb-6 text-sm text-muted">
        <Link to="/marcas" className="text-rose hover:underline">
          Marcas
        </Link>
        <span className="mx-2">→</span>
        <Link to={`/marcas/${product.brandSlug}`} className="text-rose hover:underline">
          {product.brand}
        </Link>
        <span className="mx-2">→</span>
        <Link
          to={`/marcas/${product.brandSlug}/${encodeURIComponent(product.category)}`}
          className="text-rose hover:underline"
        >
          {product.category}
        </Link>
        <span className="mx-2">→</span>
        <span className="text-brown-deep">{product.name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2">
        <ProductGallery images={images} alt={product.name} />

        <div>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-rose uppercase">
            {product.brand} · {product.category}
          </p>
          <h1 className="font-display mt-2 text-4xl font-semibold text-brown-deep">{product.name}</h1>
          <p className="mt-3 text-2xl font-semibold">{formatBRL(product.effectivePrice)}</p>

          <dl className="mt-6 grid gap-3 text-sm">
            <div className="flex justify-between border-b border-line py-2">
              <dt className="text-muted">Loja</dt>
              <dd>{product.store}</dd>
            </div>
            {product.color ? (
              <div className="flex justify-between border-b border-line py-2">
                <dt className="text-muted">Cor</dt>
                <dd>{product.color}</dd>
              </div>
            ) : null}
            {product.size ? (
              <div className="flex justify-between border-b border-line py-2">
                <dt className="text-muted">Tamanho</dt>
                <dd>{product.size}</dd>
              </div>
            ) : null}
            <div className="flex justify-between border-b border-line py-2">
              <dt className="text-muted">Prioridade</dt>
              <dd>{product.priority}</dd>
            </div>
            <div className="flex justify-between border-b border-line py-2">
              <dt className="text-muted">Status</dt>
              <dd>{product.status}</dd>
            </div>
          </dl>

          {product.notes ? (
            <div className="mt-6">
              <p className="text-xs font-semibold tracking-wide text-muted uppercase">Observações</p>
              <p className="mt-2 text-sm leading-relaxed text-ink">{product.notes}</p>
            </div>
          ) : null}

          <div className="mt-8 flex flex-wrap gap-3">
            {product.purchaseUrl ? (
              <a
                className="btn-primary"
                href={product.purchaseUrl}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={16} /> {buyLabel}
              </a>
            ) : null}
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setFormOpen(true)}
            >
              <Pencil size={14} /> Editar
            </button>
            <button type="button" className="btn-ghost" onClick={() => navigate(-1)}>
              Voltar
            </button>
          </div>
        </div>
      </div>

      <ProductFormModal
        open={formOpen}
        initial={product}
        onClose={() => setFormOpen(false)}
        onSave={async (form, pid) => {
          await api.saveProduct(form, pid);
          await load();
        }}
      />
    </AppShell>
  );
}
