import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { X } from "lucide-react";
import { CATEGORIES, PRIORITIES, STATUSES, type Product } from "../types";

type Props = {
  open: boolean;
  initial?: Product | null;
  onClose: () => void;
  onSave: (form: FormData, id?: string) => Promise<void>;
};

export function ProductFormModal({ open, initial, onClose, onSave }: Props) {
  const [preview, setPreview] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    category: "Vestidos",
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
        promotionalPrice: initial.promotionalPrice != null ? String(initial.promotionalPrice) : "",
        purchaseUrl: initial.purchaseUrl || "",
        color: initial.color || "",
        size: initial.size || "",
        priority: initial.priority,
        status: initial.status,
        notes: initial.notes || "",
      });
      setPreview(initial.imageUrl || "");
    } else {
      setForm({
        name: "",
        category: "Vestidos",
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
      setPreview("");
    }
    setFile(null);
    setError("");
  }, [open, initial]);

  if (!open) return null;

  const onFile = (f?: File) => {
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
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
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (file) fd.append("image", file);
      await onSave(fd, initial?.id);
      onClose();
    } catch {
      setError("Não foi possível salvar a peça.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-brown-deep/35 sm:place-items-center sm:p-4">
      <div className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-surface sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-display text-2xl font-semibold text-brown-deep">
            {initial ? "Editar peça" : "Nova peça"}
          </h2>
          <button type="button" className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={submit} className="overflow-y-auto p-5">
          <div className="mb-4 overflow-hidden rounded-2xl border border-line bg-cream">
            {preview ? (
              <img src={preview} alt="Prévia" className="h-48 w-full object-cover" />
            ) : (
              <div className="grid h-36 place-items-center text-sm text-muted">Sem imagem</div>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="field sm:col-span-2">
              <span>Foto</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            <label className="field sm:col-span-2">
              <span>Nome</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="field">
              <span>Categoria</span>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Prioridade</span>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                {PRIORITIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label className="field"><span>Marca</span><input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></label>
            <label className="field"><span>Loja</span><input value={form.store} onChange={(e) => setForm({ ...form, store: e.target.value })} /></label>
            <label className="field"><span>Preço original</span><input value={form.originalPrice} onChange={(e) => setForm({ ...form, originalPrice: e.target.value })} /></label>
            <label className="field"><span>Preço promocional</span><input value={form.promotionalPrice} onChange={(e) => setForm({ ...form, promotionalPrice: e.target.value })} /></label>
            <label className="field sm:col-span-2"><span>Link da loja</span><input value={form.purchaseUrl} onChange={(e) => setForm({ ...form, purchaseUrl: e.target.value })} placeholder="https://" /></label>
            <label className="field"><span>Cor</span><input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /></label>
            <label className="field"><span>Tamanho</span><input value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} /></label>
            <label className="field">
              <span>Status</span>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUSES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label className="field sm:col-span-2"><span>Observações</span><textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
          </div>
          {error ? <p className="mt-3 text-sm text-rose-deep">{error}</p> : null}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="btn-primary" disabled={loading}>{loading ? "Salvando..." : "Salvar"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
