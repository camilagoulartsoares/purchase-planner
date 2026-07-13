import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { X } from "lucide-react";
import { CATEGORIES, PRIORITIES, STATUSES, mediaUrl, type Product } from "../types";

type Props = {
  open: boolean;
  initial?: Product | null;
  onClose: () => void;
  onSave: (form: FormData, id?: string) => Promise<void>;
};

export function ProductFormModal({ open, initial, onClose, onSave }: Props) {
  const [previews, setPreviews] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    category: "Calças",
    brand: "",
    store: "",
    originalPrice: "",
    promotionalPrice: "",
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
        purchaseUrl: initial.purchaseUrl || "",
        color: initial.color || "",
        size: initial.size || "",
        priority: initial.priority,
        status: initial.status,
        notes: initial.notes || "",
      });
      const existing =
        initial.images?.map((i) => mediaUrl(i.imageUrl)) ||
        (initial.imageUrl ? [mediaUrl(initial.imageUrl)] : []);
      setPreviews(existing);
    } else {
      setForm({
        name: "",
        category: "Calças",
        brand: "",
        store: "",
        originalPrice: "",
        promotionalPrice: "",
        purchaseUrl: "",
        color: "",
        size: "",
        priority: "Quero",
        status: "Quero comprar",
        notes: "",
      });
      setPreviews([]);
    }
    setFiles([]);
    setError("");
  }, [open, initial]);

  if (!open) return null;

  const onFiles = (list?: FileList | null) => {
    if (!list?.length) return;
    const next = Array.from(list);
    setFiles(next);
    setPreviews(next.map((f) => URL.createObjectURL(f)));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.brand.trim() || !form.store.trim() || !form.originalPrice) {
      setError("Preencha nome, marca, loja e preço original.");
      return;
    }
    if (form.purchaseUrl && !/^https?:\/\//i.test(form.purchaseUrl)) {
      setError("O link deve começar com http:// ou https://");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const fd = new FormData();
      const normalizeMoney = (v: string) =>
        v.trim() ? v.replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".") : v;
      Object.entries(form).forEach(([k, v]) => {
        if (k === "originalPrice" || k === "promotionalPrice") {
          fd.append(k, normalizeMoney(v));
        } else {
          fd.append(k, v);
        }
      });
      files.forEach((file) => fd.append("images", file));
      await onSave(fd, initial?.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar a peça.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <form onSubmit={submit} className="card-soft max-h-[92vh] w-full max-w-2xl overflow-y-auto p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl font-semibold text-brown-deep">
            {initial ? "Editar peça" : "Adicionar peça"}
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
          <label className="field">
            <span>Categoria</span>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Loja</span>
            <input value={form.store} onChange={(e) => setForm({ ...form, store: e.target.value })} />
          </label>
          <label className="field">
            <span>Preço original</span>
            <input
              value={form.originalPrice}
              onChange={(e) => setForm({ ...form, originalPrice: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Preço atual / promo</span>
            <input
              value={form.promotionalPrice}
              onChange={(e) => setForm({ ...form, promotionalPrice: e.target.value })}
            />
          </label>
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
          <label className="field">
            <span>Prioridade</span>
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Status</span>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="field sm:col-span-2">
            <span>Observações</span>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>
          <label className="field sm:col-span-2">
            <span>Fotos (a primeira é a principal)</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(e) => onFiles(e.target.files)}
            />
          </label>
          {previews.length ? (
            <div className="sm:col-span-2 flex gap-2 overflow-x-auto">
              {previews.map((src, i) => (
                <img
                  key={src + i}
                  src={src}
                  alt=""
                  className={`h-24 w-16 rounded-md object-cover ${i === 0 ? "ring-2 ring-rose" : ""}`}
                />
              ))}
            </div>
          ) : null}
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
