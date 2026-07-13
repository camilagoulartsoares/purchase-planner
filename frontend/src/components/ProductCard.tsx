import { Link } from "react-router-dom";
import { ExternalLink, Pencil, ShoppingBag } from "lucide-react";
import { formatBRL, type Product } from "../types";
import { ProductGallery } from "./ProductGallery";

type Props = {
  product: Product;
  onEdit?: (p: Product) => void;
  onMarkBought?: (p: Product) => void;
};

export function ProductCard({ product, onEdit, onMarkBought }: Props) {
  const images =
    product.images?.length
      ? product.images
      : product.imageUrl
        ? [{ imageUrl: product.imageUrl }]
        : [];

  return (
    <article className="card-soft overflow-hidden">
      <ProductGallery images={images} alt={product.name} compact />
      <div className="space-y-3 p-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.12em] text-rose uppercase">
            {product.brand} · {product.category}
          </p>
          <h3 className="font-display mt-1 text-xl font-semibold text-brown-deep">
            {product.name}
          </h3>
          <p className="mt-1 text-lg font-semibold text-ink">{formatBRL(product.effectivePrice)}</p>
          <p className="mt-1 text-sm text-muted">{product.status}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="btn-primary !py-2 !text-[0.7rem]" to={`/produtos/${product.id}`}>
            Ver detalhes
          </Link>
          {product.purchaseUrl ? (
            <a
              className="btn-ghost"
              href={product.purchaseUrl}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={14} /> Comprar na loja
            </a>
          ) : null}
          {onEdit ? (
            <button type="button" className="btn-ghost" onClick={() => onEdit(product)}>
              <Pencil size={14} /> Editar
            </button>
          ) : null}
          {onMarkBought && product.status !== "Já comprei" ? (
            <button type="button" className="btn-ghost" onClick={() => onMarkBought(product)}>
              <ShoppingBag size={14} /> Marcar como comprada
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
