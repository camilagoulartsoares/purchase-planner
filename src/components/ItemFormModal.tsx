import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { ClosetItem } from "../types";
import { CATEGORIES, PRIORITIES, STATUSES } from "../types";
import { parseMoney, todayISO, uid } from "../lib/money";

type Props = {
  open: boolean;
  initial?: ClosetItem | null;
  onClose: () => void;
  onSave: (item: ClosetItem, isNew: boolean) => void;
};

type FormState = {
  imageDataUrl: string;
  imageUrl: string;
  name: string;
  category: string;
  brand: string;
  store: string;
  originalPrice: string;
  currentPrice: string;
  buyLink: string;
  color: string;
  size: string;
  priority: string;
  status: string;
  addedAt: string;
  notes: string;
};

const empty = (): FormState => ({
  imageDataUrl: "",
  imageUrl: "",
  name: "",
  category: "Vestidos",
  brand: "",
  store: "",
  originalPrice: "",
  currentPrice: "",
  buyLink: "",
  color: "",
  size: "",
  priority: "Quero",
  status: "Quero comprar",
  addedAt: todayISO(),
  notes: "",
});

export function ItemFormModal({ open, initial, onClose, onSave }: Props) {
  const [form, setForm] = useState<FormState>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        imageDataUrl: initial.imageDataUrl || "",
        imageUrl: initial.imageUrl || "",
        name: initial.name,
        category: initial.category,
        brand: initial.brand,
        store: initial.store,
        originalPrice: String(initial.originalPrice),
        currentPrice: String(initial.currentPrice),
        buyLink: initial.buyLink || "",
        color: initial.color,
        size: initial.size,
        priority: initial.priority,
        status: initial.status,
        addedAt: initial.addedAt,
        notes: initial.notes || "",
      });
    } else {
      setForm(empty());
    }
    setErrors({});
  }, [open, initial]);

  const preview = useMemo(
    () => form.imageDataUrl || form.imageUrl,
    [form.imageDataUrl, form.imageUrl],
  );

  if (!open) return null;

  const patch = (partial: Partial<FormState>) =>
    setForm((prev) => ({ ...prev, ...partial }));

  const onFile = (file?: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      patch({ imageDataUrl: String(reader.result || "") });
    };
    reader.readAsDataURL(file);
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = "Informe o nome da peça";
    if (!form.brand.trim()) next.brand = "Informe a marca";
    if (!form.store.trim()) next.store = "Informe a loja";
    const original = parseMoney(form.originalPrice);
    if (original <= 0) next.originalPrice = "Informe o preço original";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const original = parseMoney(form.originalPrice);
    const currentRaw = form.currentPrice.trim()
      ? parseMoney(form.currentPrice)
      : original;

    const item: ClosetItem = {
      id: initial?.id || uid(),
      imageDataUrl: form.imageDataUrl || undefined,
      imageUrl: form.imageUrl || undefined,
      name: form.name.trim(),
      category: form.category as ClosetItem["category"],
      brand: form.brand.trim(),
      store: form.store.trim(),
      originalPrice: original,
      currentPrice: currentRaw,
      buyLink: form.buyLink.trim() || undefined,
      color: form.color.trim(),
      size: form.size.trim(),
      priority: form.priority as ClosetItem["priority"],
      status: form.status as ClosetItem["status"],
      addedAt: form.addedAt || todayISO(),
      notes: form.notes.trim() || undefined,
      paidPrice: initial?.paidPrice,
      purchasedAt: initial?.purchasedAt,
      purchaseNotes: initial?.purchaseNotes,
    };

    onSave(item, !initial);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-brown-deep/35 p-0 sm:place-items-center sm:p-4">
      <div className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-surface shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.14em] text-rose uppercase">
              {initial ? "Editar peça" : "Nova peça"}
            </p>
            <h2 className="font-display text-2xl font-semibold text-brown-deep">
              {initial ? "Atualizar desejo" : "Adicionar ao closet"}
            </h2>
          </div>
          <button type="button" className="btn-ghost" onClick={onClose} aria-label="Fechar">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={submit} className="overflow-y-auto px-5 py-5">
          <div className="mb-4 overflow-hidden rounded-2xl border border-line bg-cream">
            {preview ? (
              <img src={preview} alt="Pré-visualização" className="h-48 w-full object-cover" />
            ) : (
              <div className="grid h-36 place-items-center text-sm text-muted">
                Sem imagem ainda
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="field sm:col-span-2">
              <span>Upload de imagem</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => onFile(e.target.files?.[0])}
              />
            </label>
            <label className="field sm:col-span-2">
              <span>URL da imagem</span>
              <input
                value={form.imageUrl}
                onChange={(e) => patch({ imageUrl: e.target.value })}
                placeholder="https://..."
              />
            </label>
            <label className="field sm:col-span-2">
              <span>Nome da peça *</span>
              <input
                value={form.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="Ex.: Vestido midi floral"
              />
              {errors.name ? <span className="error">{errors.name}</span> : null}
            </label>
            <label className="field">
              <span>Categoria</span>
              <select
                value={form.category}
                onChange={(e) => patch({ category: e.target.value })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Prioridade</span>
              <select
                value={form.priority}
                onChange={(e) => patch({ priority: e.target.value })}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Marca *</span>
              <input value={form.brand} onChange={(e) => patch({ brand: e.target.value })} />
              {errors.brand ? <span className="error">{errors.brand}</span> : null}
            </label>
            <label className="field">
              <span>Loja *</span>
              <input value={form.store} onChange={(e) => patch({ store: e.target.value })} />
              {errors.store ? <span className="error">{errors.store}</span> : null}
            </label>
            <label className="field">
              <span>Preço original *</span>
              <input
                value={form.originalPrice}
                onChange={(e) => patch({ originalPrice: e.target.value })}
                placeholder="199,90"
              />
              {errors.originalPrice ? (
                <span className="error">{errors.originalPrice}</span>
              ) : null}
            </label>
            <label className="field">
              <span>Preço atual / promocional</span>
              <input
                value={form.currentPrice}
                onChange={(e) => patch({ currentPrice: e.target.value })}
                placeholder="Se vazio, usa o original"
              />
            </label>
            <label className="field sm:col-span-2">
              <span>Link para comprar</span>
              <input
                value={form.buyLink}
                onChange={(e) => patch({ buyLink: e.target.value })}
                placeholder="https://..."
              />
            </label>
            <label className="field">
              <span>Cor</span>
              <input value={form.color} onChange={(e) => patch({ color: e.target.value })} />
            </label>
            <label className="field">
              <span>Tamanho</span>
              <input value={form.size} onChange={(e) => patch({ size: e.target.value })} />
            </label>
            <label className="field">
              <span>Status</span>
              <select value={form.status} onChange={(e) => patch({ status: e.target.value })}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Data de adição</span>
              <input
                type="date"
                value={form.addedAt}
                onChange={(e) => patch({ addedAt: e.target.value })}
              />
            </label>
            <label className="field sm:col-span-2">
              <span>Observações</span>
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => patch({ notes: e.target.value })}
              />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-line pt-4">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary">
              {initial ? "Salvar alterações" : "Adicionar peça"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
