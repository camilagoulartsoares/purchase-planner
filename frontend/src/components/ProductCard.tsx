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
import { hasLivePromoPrice } from "../utils/promo";

type Props = {
  product: Product;
  promoLabel?: string | null;
  promoCurrentPrice?: number | null;
  promoReferencePrice?: number | null;
  promoDiscountPercentage?: number | null;
  promoPixPrice?: number | null;
  onEdit?: (p: Product) => void;
  onMarkBought?: (p: Product) => void;
  onFavorite?: (p: Product) => void;
  onStatus?: (p: Product, status: string) => void;
  onDelete?: (p: Product) => void;
  onRefreshShipping?: (p: Product) => Promise<void> | void;
};

export function ProductCard({
  product,
  promoLabel,
  promoCurrentPrice,
  promoReferencePrice,
  promoDiscountPercentage,
  promoPixPrice,
  onEdit,
  onMarkBought,
  onFavorite,
  onStatus,
  onDelete,
  onRefreshShipping,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [shippingLoading, setShippingLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const shipping = product.effectiveShippingPrice ?? product.shippingPrice;

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

  const hasPromoPrice = hasLivePromoPrice(promoCurrentPrice, promoReferencePrice);
  const livePromoCurrentPrice = hasPromoPrice ? promoCurrentPrice : null;
  const livePromoReferencePrice = hasPromoPrice ? promoReferencePrice : null;

  return (
    <article className="card-soft relative overflow-visible">
      <div className="relative overflow-hidden rounded-t-[1.1rem]">
        <ProductGallery images={images} alt={product.name} compact />
        {promoLabel ? (
          <div className="sale-badge absolute top-2 left-2 z-20">
            {promoLabel}
          </div>
        ) : null}
        {onFavorite ? (
          <button
            type="button"
            className={`favorite-btn absolute top-2 right-2 z-20 ${
              product.isFavorite ? "is-favorite" : ""
            }`}
            onClick={() => onFavorite(product)}
            aria-label={product.isFavorite ? "Remover dos favoritos" : "Favoritar"}
            aria-pressed={product.isFavorite}
            title={product.isFavorite ? "Remover dos favoritos" : "Favoritar"}
          >
            <Heart
              size={18}
              className={product.isFavorite ? "fill-white text-white" : "text-brown-deep"}
            />
          </button>
        ) : null}
      </div>

      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.12em] text-rose uppercase">
              {product.brand} - {product.category}
            </p>
            <Link
              to={`/produtos/${product.id}`}
              className="font-display mt-1 block text-xl font-semibold text-brown-deep hover:text-rose"
              aria-label={`Abrir detalhes de ${product.name}`}
              title={`Abrir detalhes de ${product.name}`}
            >
              {product.name}
            </Link>
            {hasPromoPrice ? (
              <div className="mt-1">
                <p className="sale-price-row">
                  <span className="sale-price-old">
                    {formatBRL(livePromoReferencePrice ?? 0)}
                  </span>
                  <strong className="sale-price-current">
                    {formatBRL(livePromoCurrentPrice ?? 0)}
                  </strong>
                  {promoDiscountPercentage != null ? (
                    <span className="sale-discount-pill">
                      {promoDiscountPercentage}% OFF
                    </span>
                  ) : null}
                </p>
                {promoPixPrice != null ? (
                  <p className="sale-extra-note">PIX: {formatBRL(promoPixPrice)}</p>
                ) : null}
              </div>
            ) : (
              <p className="mt-1 text-lg font-semibold text-ink">
                {formatBRL(product.effectivePrice)}
              </p>
            )}
            {shipping != null ? (
              <p className="mt-1 text-xs font-semibold text-muted">
                {product.shippingInherited ? "Frete da marca " : "Frete "}
                {formatBRL(shipping)}
              </p>
            ) : null}
            <p className="mt-1 text-sm text-muted">{product.status}</p>
          </div>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              className="btn-ghost !px-2"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Mais opcoes"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              title="Mais opções da peça"
            >
              <MoreVertical size={16} />
            </button>
            {menuOpen ? (
              <div className="card-menu absolute right-0 z-40 mt-1 w-52 rounded-xl border border-line bg-surface py-1 shadow-lg">
                {onEdit ? (
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-cream-deep"
                    onClick={() => {
                      setMenuOpen(false);
                      onEdit(product);
                    }}
                    title={`Editar ${product.name}`}
                    aria-label={`Editar ${product.name}`}
                  >
                    Editar
                  </button>
                ) : null}
                {onStatus ? (
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-cream-deep"
                    onClick={() => {
                      setMenuOpen(false);
                      onStatus(product, "Desisti da compra");
                    }}
                    title={`Marcar ${product.name} como não desejada`}
                    aria-label={`Marcar ${product.name} como não desejada`}
                  >
                    Nao quero mais
                  </button>
                ) : null}
                {onMarkBought && product.status !== "Já comprei" ? (
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-cream-deep"
                    onClick={() => {
                      setMenuOpen(false);
                      onMarkBought(product);
                    }}
                    title={`Marcar ${product.name} como comprada`}
                    aria-label={`Marcar ${product.name} como comprada`}
                  >
                    Marcar como comprada
                  </button>
                ) : null}
                {onDelete ? (
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm text-rose-deep hover:bg-cream-deep"
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete(product);
                    }}
                    title={`Excluir ${product.name} definitivamente`}
                    aria-label={`Excluir ${product.name} definitivamente`}
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
              title={`Abrir ${product.brand || "a loja"} em nova aba`}
              aria-label={`Abrir ${product.brand || "a loja"} em nova aba`}
            >
              <ExternalLink size={14} /> Comprar na loja
            </a>
          ) : null}
          {product.purchaseUrl && onRefreshShipping ? (
            <button
              type="button"
              className="btn-ghost"
              disabled={shippingLoading}
              onClick={async () => {
                setShippingLoading(true);
                try { await onRefreshShipping(product); } finally { setShippingLoading(false); }
              }}
              title="Calcular o menor frete para o CEP 37500-224"
            >
              {shippingLoading ? "Calculando frete..." : "Calcular frete"}
            </button>
          ) : null}
          {product.status !== "Já comprei" ? (
            <Link className="btn-ghost" title={`Analisar compra de ${product.name}`} aria-label={`Analisar se vale a pena comprar ${product.name}`} to={`/produtos/${product.id}?analysis=1`}>
              Vale a pena comprar?
            </Link>
          ) : null}
          {onMarkBought && product.status !== "Já comprei" ? (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => onMarkBought(product)}
              title="Registrar esta peça como comprada"
              aria-label={`Registrar ${product.name} como comprada`}
            >
              <ShoppingBag size={14} /> Marcar como comprada
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
