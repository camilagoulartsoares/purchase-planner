import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ExternalLink,
  Heart,
  MoreVertical,
  ShoppingBag,
} from "lucide-react";
import { formatBRL, type Product } from "../types";
import { ProductGallery } from "./ProductGallery";

type Props = {
  product: Product;
  onEdit?: (p: Product) => void;
  onMarkBought?: (p: Product) => void;
  onFavorite?: (p: Product) => void;
  onStatus?: (p: Product, status: string) => void;
  onDelete?: (p: Product) => void;
};

export function ProductCard({
  product,
  onEdit,
  onMarkBought,
  onFavorite,
  onStatus,
  onDelete,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const images =
    product.images?.length
      ? product.images
      : product.imageUrl
        ? [{ imageUrl: product.imageUrl }]
        : [];

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  return (
    <article className="card-soft overflow-hidden">
      <div className="relative">
        <ProductGallery images={images} alt={product.name} compact />
        {onFavorite ? (
          <button
            type="button"
            className="absolute top-2 right-2 z-20 rounded-full bg-surface/95 p-2 shadow"
            onClick={() => onFavorite(product)}
            aria-label={product.isFavorite ? "Remover dos favoritos" : "Favoritar"}
          >
            <Heart
              size={16}
              className={product.isFavorite ? "fill-rose text-rose" : "text-brown-deep"}
            />
          </button>
        ) : null}
      </div>

      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.12em] text-rose uppercase">
              {product.brand} · {product.category}
            </p>
            <Link
              to={`/produtos/${product.id}`}
              className="font-display mt-1 block text-xl font-semibold text-brown-deep hover:text-rose"
            >
              {product.name}
            </Link>
            <p className="mt-1 text-lg font-semibold text-ink">
              {formatBRL(product.effectivePrice)}
            </p>
            <p className="mt-1 text-sm text-muted">{product.status}</p>
          </div>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              className="btn-ghost !px-2"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Mais opções"
            >
              <MoreVertical size={16} />
            </button>
            {menuOpen ? (
              <div className="absolute right-0 z-30 mt-1 w-48 rounded-xl border border-line bg-surface py-1 shadow-lg">
                {onEdit ? (
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-cream-deep"
                    onClick={() => {
                      setMenuOpen(false);
                      onEdit(product);
                    }}
                  >
                    Editar
                  </button>
                ) : null}
                {onStatus ? (
                  <>
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-cream-deep"
                      onClick={() => {
                        setMenuOpen(false);
                        onStatus(product, "Esperando promoção");
                      }}
                    >
                      Esperar promoção
                    </button>
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-cream-deep"
                      onClick={() => {
                        setMenuOpen(false);
                        onStatus(product, "Desisti da compra");
                      }}
                    >
                      Não quero mais
                    </button>
                  </>
                ) : null}
                {onDelete ? (
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm text-rose-deep hover:bg-cream-deep"
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete(product);
                    }}
                  >
                    Excluir definitivamente
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
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
          {onMarkBought && product.status !== "Já comprei" ? (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => onMarkBought(product)}
            >
              <ShoppingBag size={14} /> Marcar como comprada
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
