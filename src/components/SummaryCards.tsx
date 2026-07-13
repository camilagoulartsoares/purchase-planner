import { formatBRL } from "../lib/money";

type Summary = {
  wantCount: number;
  boughtCount: number;
  wishTotal: number;
  spentTotal: number;
  savedTotal: number;
  waitingCount: number;
};

export function SummaryCards({ summary }: { summary: Summary }) {
  const cards = [
    { label: "Quero comprar", value: String(summary.wantCount) },
    { label: "Já comprei", value: String(summary.boughtCount) },
    { label: "Total desejos", value: formatBRL(summary.wishTotal) },
    { label: "Total gasto", value: formatBRL(summary.spentTotal) },
    { label: "Economizado", value: formatBRL(summary.savedTotal) },
    { label: "Esperando promoção", value: String(summary.waitingCount) },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => (
        <article key={card.label} className="card-soft px-4 py-4">
          <p className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
            {card.label}
          </p>
          <p className="font-display mt-2 text-2xl font-semibold text-brown-deep">
            {card.value}
          </p>
        </article>
      ))}
    </section>
  );
}
