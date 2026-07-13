import type { Status } from "../types";
import { STATUSES } from "../types";

type Props = {
  tab: Status | "Todas";
  counts: Record<Status, number>;
  onChange: (tab: Status | "Todas") => void;
};

export function StatusTabs({ tab, counts, onChange }: Props) {
  const tabs: { id: Status; label: string }[] = [
    { id: "Quero comprar", label: "Quero comprar" },
    { id: "Esperando promoção", label: "Esperando promoção" },
    { id: "Comprada", label: "Já comprei" },
    { id: "Desisti da compra", label: "Desisti da compra" },
  ];

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {tabs.map((t) => {
        const active = tab === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
              active
                ? "bg-rose text-white shadow-sm"
                : "border border-line bg-surface text-brown-deep hover:border-rose/40"
            }`}
          >
            {t.label}
            <span className={`ml-2 ${active ? "text-white/80" : "text-muted"}`}>
              {counts[t.id]}
            </span>
          </button>
        );
      })}
      {/* keep STATUSES referenced for type safety */}
      <span className="sr-only">{STATUSES.join(",")}</span>
    </div>
  );
}
