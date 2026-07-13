import {
  ExternalLink,
  HeartCrack,
  Pencil,
  ShoppingBag,
  Tag,
  Trash2,
} from "lucide-react";
import type { ClosetItem } from "../types";
import { discountPercent, effectivePrice, formatBRL, hasPromo } from "../lib/money";

type Props = {
  item: ClosetItem;
  compact?: boolean;
  onEdit: (item: ClosetItem) => void;
  onDelete: (item: ClosetItem) => void;
  onBought: (item: ClosetItem) => void;
  onWaitPromo: (item: ClosetItem) => void;
  onGiveUp: (item: ClosetItem) => void;
};

function Placeholder() {
  return (
    <div className="grid h-full w-full place-items-center bg-gradient-to-br from-beige to-cream-deep text-brown/50">
      <Tag size={28} />
    </div>
  );
}

export function ItemCard({
  item,
  compact,
  onEdit,
  onDelete,
  onBought,
  onWaitPromo,
  onGiveUp,
}: Props) {
  const promo = hasPromo(item);
  const pct = discountPercent(item);
  const image = item.imageDataUrl || item.imageUrl;

  if (compact) {
    return (
      <article className="card-soft grid gap-3 p-3 sm:grid-cols-[88px_1fr_auto] sm:items-center">
        <div className="relative h-20 w-full overflow-hidden rounded-xl sm:h-20 sm:w-22">
          {image ? (
            <img src={image} alt={item.name} className="h-full w-full object-cover" />
          ) : (
            <Placeholder />
          )}
        </div>
        <div className="min-w-0">
          <h3 className="truncate font-medium text-brown-deep">{item.name}</h3>
          <p className="mt-0.5 text-xs text-muted">
            {item.brand} · {item.store} · {item.category}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            {promo ? (
              <>
                <span className="text-xs text-muted line-through">
                  {formatBRL(item.originalPrice)}
                </span>
                <span className="font-semibold text-rose">{formatBRL(item.currentPrice)}</span>
                <span className="rounded-full bg-rose/10 px-2 py-0.5 text-[10px] font-semibold text-rose">
                  -{pct}%
                </span>
              </>
            ) : (
              <span className="font-semibold text-brown-deep">
                {formatBRL(effectivePrice(item))}
              </span>
            )}
          </div>
        </div>
        <Actions
          item={item}
          onEdit={onEdit}
          onDelete={onDelete}
          onBought={onBought}
          onWaitPromo={onWaitPromo}
          onGiveUp={onGiveUp}
          dense
        />
      </article>
    );
  }

  return (
    <article className="card-soft overflow-hidden">
      <div className="relative aspect-[4/5] bg-cream-deep">
        {image ? (
          <img src={image} alt={item.name} className="h-full w-full object-cover" />
        ) : (
          <Placeholder />
        )}
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-surface/95 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-brown-deep uppercase">
            {item.priority}
          </span>
          {promo ? (
            <span className="rounded-full bg-rose px-2.5 py-1 text-[10px] font-semibold text-white">
              -{pct}%
            </span>
          ) : null}
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
            {item.category}
          </p>
          <h3 className="font-display mt-1 text-xl font-semibold text-brown-deep">
            {item.name}
          </h3>
          <p className="mt-1 text-sm text-muted">
            {item.brand} · {item.store}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          {promo ? (
            <>
              <span className="text-sm text-muted line-through">
                {formatBRL(item.originalPrice)}
              </span>
              <span className="text-lg font-semibold text-rose">
                {formatBRL(item.currentPrice)}
              </span>
            </>
          ) : (
            <span className="text-lg font-semibold text-brown-deep">
              {formatBRL(effectivePrice(item))}
            </span>
          )}
        </div>

        <p className="text-xs text-muted">
          Cor: {item.color || "—"} · Tamanho: {item.size || "—"} · {item.status}
        </p>

        <Actions
          item={item}
          onEdit={onEdit}
          onDelete={onDelete}
          onBought={onBought}
          onWaitPromo={onWaitPromo}
          onGiveUp={onGiveUp}
        />
      </div>
    </article>
  );
}

function Actions({
  item,
  onEdit,
  onDelete,
  onBought,
  onWaitPromo,
  onGiveUp,
  dense,
}: Props & { dense?: boolean }) {
  return (
    <div className={`flex flex-wrap gap-1.5 ${dense ? "justify-end" : ""}`}>
      {item.buyLink ? (
        <a
          href={item.buyLink}
          target="_blank"
          rel="noreferrer"
          className="btn-ghost"
          title="Ver na loja"
        >
          <ExternalLink size={14} /> {!dense && "Ver na loja"}
        </a>
      ) : null}
      <button type="button" className="btn-ghost" onClick={() => onEdit(item)} title="Editar">
        <Pencil size={14} /> {!dense && "Editar"}
      </button>
      {item.status !== "Comprada" ? (
        <button
          type="button"
          className="btn-ghost"
          onClick={() => onBought(item)}
          title="Marcar como comprada"
        >
          <ShoppingBag size={14} /> {!dense && "Comprada"}
        </button>
      ) : null}
      {item.status !== "Esperando promoção" ? (
        <button
          type="button"
          className="btn-ghost"
          onClick={() => onWaitPromo(item)}
          title="Esperando promoção"
        >
          <Tag size={14} /> {!dense && "Promoção"}
        </button>
      ) : null}
      {item.status !== "Desisti da compra" ? (
        <button
          type="button"
          className="btn-ghost"
          onClick={() => onGiveUp(item)}
          title="Desistir"
        >
          <HeartCrack size={14} /> {!dense && "Desistir"}
        </button>
      ) : null}
      <button
        type="button"
        className="btn-ghost text-rose-deep!"
        onClick={() => onDelete(item)}
        title="Excluir"
      >
        <Trash2 size={14} /> {!dense && "Excluir"}
      </button>
    </div>
  );
}
