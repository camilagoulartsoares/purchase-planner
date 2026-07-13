import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { ClosetItem } from "../types";
import { effectivePrice, parseMoney, todayISO } from "../lib/money";

type Props = {
  item: ClosetItem | null;
  onClose: () => void;
  onConfirm: (data: {
    paidPrice: number;
    purchasedAt: string;
    purchaseNotes?: string;
  }) => void;
};

export function PurchaseModal({ item, onClose, onConfirm }: Props) {
  const [paidPrice, setPaidPrice] = useState("");
  const [purchasedAt, setPurchasedAt] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!item) return;
    setPaidPrice(String(effectivePrice(item)));
    setPurchasedAt(todayISO());
    setNotes("");
    setError("");
  }, [item]);

  if (!item) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseMoney(paidPrice);
    if (value <= 0) {
      setError("Informe o preço realmente pago");
      return;
    }
    onConfirm({
      paidPrice: value,
      purchasedAt,
      purchaseNotes: notes.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-brown-deep/35 p-4">
      <div className="w-full max-w-md rounded-3xl bg-surface p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.14em] text-rose uppercase">
              Compra
            </p>
            <h2 className="font-display text-2xl font-semibold text-brown-deep">
              Marcar como comprada
            </h2>
            <p className="mt-1 text-sm text-muted">{item.name}</p>
          </div>
          <button type="button" className="btn-ghost" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={submit} className="grid gap-3">
          <label className="field">
            <span>Preço realmente pago *</span>
            <input
              value={paidPrice}
              onChange={(e) => setPaidPrice(e.target.value)}
              placeholder="129,90"
            />
            {error ? <span className="error">{error}</span> : null}
          </label>
          <label className="field">
            <span>Data da compra *</span>
            <input
              type="date"
              value={purchasedAt}
              onChange={(e) => setPurchasedAt(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>Observação (opcional)</span>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary">
              Confirmar compra
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
