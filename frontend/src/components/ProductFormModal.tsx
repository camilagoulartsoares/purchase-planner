import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Check, ChevronDown, Star, X } from "lucide-react";
import {
  FASHION_CATEGORIES,
  PRIORITIES,
  STATUSES,
  formatBRL,
  mediaUrl,
  type Product,
} from "../types";

type GalleryItem =
  | { kind: "existing"; id: string; url: string; isMain: boolean }
  | { kind: "new"; key: string; file: File; url: string; isMain: boolean };

type Props = {
  open: boolean;
  initial?: Product | null;
  onClose: () => void;
  onSave: (form: FormData, id?: string) => Promise<void>;
};

const moneyFields = ["originalPrice", "promotionalPrice", "shippingPrice"] as const;

function sanitizeMoneyInput(value: string) {
  return value
    .replace(/[^\d,.]/g, "")
    .replace(/([,.])(?=.*[,.])/g, "");
}

function normalizeMoney(value: string) {
  const raw = sanitizeMoneyInput(value);
  if (!raw) return "";
  const comma = raw.lastIndexOf(",");
  const dot = raw.lastIndexOf(".");
  const separator = comma > dot ? "," : dot > -1 ? "." : "";
  if (!separator) return raw.replace(/[,.]/g, "");

  const index = raw.lastIndexOf(separator);
  const integer = raw.slice(0, index).replace(/[,.]/g, "");
  const decimal = raw.slice(index + 1);
  return `${integer || "0"}.${decimal}`;
}

function moneyNumber(value: string) {
  const normalized = normalizeMoney(value);
  if (!normalized) return 0;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function ModalSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="modal-select" ref={ref}>
      <span>{label}</span>
      <button
        type="button"
        className="modal-select-trigger"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{value}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open ? (
        <div className="modal-select-menu" role="listbox">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              className={`modal-select-option ${option === value ? "is-selected" : ""}`}
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
              role="option"
              aria-selected={option === value}
            >
              <span>{option}</span>
              {option === value ? <Check size={14} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ProductFormModal({ open, initial, onClose, onSave }: Props) {
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    category: "Calças",
    brand: "",
    store: "",
    originalPrice: "",
    promotionalPrice: "",
    shippingPrice: "",
    purchaseUrl: "",
    color: "",
    size: "",
    priority: "Quero",
    status: "Quero comprar",
    notes: "",
  });

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        name: initial.name,
        category: initial.category,
        brand: initial.brand,
        store: initial.store,
        originalPrice: String(initial.originalPrice),
        promotionalPrice:
          initial.promotionalPrice != null ? String(initial.promotionalPrice) : "",
        shippingPrice:
          initial.shippingPrice != null ? String(initial.shippingPrice) : "",
        purchaseUrl: initial.purchaseUrl || "",
        color: initial.color || "",
        size: initial.size || "",
        priority: initial.priority,
        status: initial.status,
        notes: initial.notes || "",
      });
      const existing =
        initial.images?.map((i) => ({
          kind: "existing" as const,
          id: i.id,
          url: mediaUrl(i.imageUrl),
          isMain: i.isMain,
        })) ||
        (initial.imageUrl
          ? [
              {
                kind: "existing" as const,
                id: "legacy-main",
                url: mediaUrl(initial.imageUrl),
                isMain: true,
              },
            ]
          : []);
      if (existing.length && !existing.some((i) => i.isMain)) {
        existing[0].isMain = true;
      }
      setGallery(existing);
    } else {
      setForm({
        name: "",
        category: "Calças",
        brand: "",
        store: "",
        originalPrice: "",
        promotionalPrice: "",
        shippingPrice: "",
        purchaseUrl: "",
        color: "",
        size: "",
        priority: "Quero",
        status: "Quero comprar",
        notes: "",
      });
      setGallery([]);
    }
    setError("");
  }, [open, initial]);

  if (!open) return null;

  const onFiles = (list?: FileList | null) => {
    if (!list?.length) return;
    const next = Array.from(list).map((file, index) => ({
      kind: "new" as const,
      key: `${file.name}-${file.size}-${Date.now()}-${index}`,
      file,
      url: URL.createObjectURL(file),
      isMain: false,
    }));
    setGallery((prev) => {
      const merged = [...prev, ...next];
      if (!merged.some((i) => i.isMain) && merged[0]) {
        merged[0] = { ...merged[0], isMain: true };
      }
      return merged;
    });
  };

  const removeItem = (index: number) => {
    setGallery((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length && !next.some((i) => i.isMain)) {
        next[0] = { ...next[0], isMain: true };
      }
      return next;
    });
  };

  const setMain = (index: number) => {
    setGallery((prev) =>
      prev.map((item, i) => ({ ...item, isMain: i === index })),
    );
  };

  const setMoney = (field: (typeof moneyFields)[number], value: string) => {
    setForm((current) => ({ ...current, [field]: sanitizeMoneyInput(value) }));
  };

  const originalPrice = moneyNumber(form.originalPrice);
  const promotionalPrice = moneyNumber(form.promotionalPrice);
  const shippingPrice = moneyNumber(form.shippingPrice);
  const basePrice =
    promotionalPrice > 0 && originalPrice > 0 && promotionalPrice < originalPrice
      ? promotionalPrice
      : originalPrice;
  const totalWithShipping = basePrice + shippingPrice;
  const showTotalPreview = basePrice > 0 || shippingPrice > 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.brand.trim() || !form.store.trim() || !form.originalPrice) {
      setError("Preencha nome, marca, loja e preco original.");
      return;
    }
    if (form.purchaseUrl && !/^https?:\/\//i.test(form.purchaseUrl)) {
      setError("O link deve comecar com http:// ou https://");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        if ((moneyFields as readonly string[]).includes(k)) {
          fd.append(k, normalizeMoney(v));
        } else {
          fd.append(k, v);
        }
      });

      if (initial?.id) {
        const keepIds = gallery
          .filter((i) => i.kind === "existing" && i.id !== "legacy-main")
          .map((i) => (i as Extract<GalleryItem, { kind: "existing" }>).id);
        fd.append("keepImageIds", JSON.stringify(keepIds));
        const mainItem = gallery.find((i) => i.isMain);
        if (mainItem?.kind === "existing" && mainItem.id !== "legacy-main") {
          fd.append("mainImageId", mainItem.id);
        } else if (mainItem?.kind === "new") {
          const newItems = gallery.filter((i) => i.kind === "new");
          const idx = newItems.findIndex(
            (i) => (i as Extract<GalleryItem, { kind: "new" }>).key === mainItem.key,
          );
          if (idx >= 0) fd.append("mainNewIndex", String(idx));
        }
      }

      gallery
        .filter((i) => i.kind === "new")
        .forEach((i) => fd.append("images", (i as Extract<GalleryItem, { kind: "new" }>).file));

      await onSave(fd, initial?.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel salvar a peca.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <form onSubmit={submit} className="modal-form-scroll card-soft max-h-[92vh] w-full max-w-2xl overflow-y-auto p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl font-semibold text-brown-deep">
            {initial ? "Editar peca" : "Adicionar peca"}
          </h2>
          <button type="button" className="btn-ghost" onClick={onClose} aria-label="Fechar">
            <X size={16} />
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="field sm:col-span-2">
            <span>Nome</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="field">
            <span>Marca</span>
            <input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
          </label>
          <ModalSelect
            label="Categoria"
            value={form.category}
            options={FASHION_CATEGORIES}
            onChange={(category) => setForm({ ...form, category })}
          />
          <label className="field">
            <span>Loja</span>
            <input value={form.store} onChange={(e) => setForm({ ...form, store: e.target.value })} />
          </label>
          <label className="field">
            <span>Preco original</span>
            <input
              type="text"
              inputMode="decimal"
              pattern="[0-9.,]*"
              autoComplete="off"
              placeholder="Ex: 129,90"
              value={form.originalPrice}
              onChange={(e) => setMoney("originalPrice", e.target.value)}
            />
          </label>
          <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
            <label className="field">
              <span>Preco atual / promo</span>
              <input
                type="text"
                inputMode="decimal"
                pattern="[0-9.,]*"
                autoComplete="off"
                placeholder="Ex: 99,90"
                value={form.promotionalPrice}
                onChange={(e) => setMoney("promotionalPrice", e.target.value)}
              />
            </label>
            <label className="field">
              <span>Frete</span>
              <input
                type="text"
                inputMode="decimal"
                pattern="[0-9.,]*"
                autoComplete="off"
                placeholder="Ex: 25,22"
                value={form.shippingPrice}
                onChange={(e) => setMoney("shippingPrice", e.target.value)}
              />
            </label>
          </div>
          {showTotalPreview ? (
            <div className="price-total-preview sm:col-span-2">
              <span>Total com frete</span>
              <strong>{formatBRL(totalWithShipping)}</strong>
            </div>
          ) : null}
          <label className="field sm:col-span-2">
            <span>Link para compra</span>
            <input
              value={form.purchaseUrl}
              onChange={(e) => setForm({ ...form, purchaseUrl: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Cor</span>
            <input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
          </label>
          <label className="field">
            <span>Tamanho</span>
            <input value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} />
          </label>
          <ModalSelect
            label="Prioridade"
            value={form.priority}
            options={PRIORITIES}
            onChange={(priority) => setForm({ ...form, priority })}
          />
          <ModalSelect
            label="Status"
            value={form.status}
            options={STATUSES}
            onChange={(status) => setForm({ ...form, status })}
          />
          <label className="field sm:col-span-2">
            <span>Observacoes</span>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>
          <label className="field sm:col-span-2">
            <span>Adicionar fotos</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(e) => {
                onFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          {gallery.length ? (
            <div className="sm:col-span-2">
              <p className="mb-2 text-xs text-muted">
                Toque na estrela para definir a principal. Use X para remover.
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {gallery.map((item, i) => (
                  <div key={item.kind === "existing" ? item.id : item.key} className="relative shrink-0">
                    <img
                      src={item.url}
                      alt=""
                      className={`h-28 w-20 rounded-md object-cover ${
                        item.isMain ? "ring-2 ring-rose" : "ring-1 ring-black/10"
                      }`}
                    />
                    <button
                      type="button"
                      className="absolute left-1 top-1 rounded-full bg-white/90 p-1 text-brown-deep shadow"
                      onClick={() => setMain(i)}
                      title="Definir como principal"
                      aria-label="Definir como principal"
                    >
                      <Star size={12} fill={item.isMain ? "currentColor" : "none"} />
                    </button>
                    <button
                      type="button"
                      className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-rose-deep shadow"
                      onClick={() => removeItem(i)}
                      title="Remover foto"
                      aria-label="Remover foto"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="sm:col-span-2 text-sm text-muted">Nenhuma foto na galeria.</p>
          )}
        </div>

        {error ? <p className="mt-3 text-sm text-rose-deep">{error}</p> : null}

        <div className="mt-5 flex gap-2">
          <button className="btn-primary" disabled={loading}>
            {loading ? "Salvando..." : "Salvar"}
          </button>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
