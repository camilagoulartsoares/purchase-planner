import { formatBRL } from "../lib/money";
import type { Budget } from "../types";

type Props = {
  budget: Budget;
  monthSpent: number;
  onChangeLimit: (value: number) => void;
};

export function BudgetPanel({ budget, monthSpent, onChangeLimit }: Props) {
  const limit = budget.monthlyLimit || 0;
  const available = Math.max(0, limit - monthSpent);
  const pct = limit > 0 ? Math.min(100, Math.round((monthSpent / limit) * 100)) : 0;
  const nearLimit = pct >= 80;

  return (
    <section className="card-soft p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.14em] text-rose uppercase">
            Meu orçamento
          </p>
          <h2 className="font-display mt-1 text-2xl font-semibold text-brown-deep">
            Limite mensal de gastos
          </h2>
        </div>
        <label className="field max-w-[220px]">
          <span>Orçamento do mês (R$)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={budget.monthlyLimit || ""}
            onChange={(e) => onChangeLimit(Number(e.target.value) || 0)}
          />
        </label>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-cream px-4 py-3">
          <p className="text-xs text-muted">Orçamento definido</p>
          <p className="mt-1 font-semibold text-brown-deep">{formatBRL(limit)}</p>
        </div>
        <div className="rounded-xl bg-cream px-4 py-3">
          <p className="text-xs text-muted">Gasto no mês</p>
          <p className="mt-1 font-semibold text-brown-deep">{formatBRL(monthSpent)}</p>
        </div>
        <div className="rounded-xl bg-cream px-4 py-3">
          <p className="text-xs text-muted">Ainda disponível</p>
          <p className="mt-1 font-semibold text-brown-deep">{formatBRL(available)}</p>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-muted">{pct}% utilizado</span>
          {nearLimit ? (
            <span className="text-xs font-medium text-warn">
              Atenção: próximo do limite
            </span>
          ) : null}
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-beige">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              nearLimit ? "bg-warn" : "bg-rose"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </section>
  );
}
