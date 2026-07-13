import { Search, Sparkles } from "lucide-react";

type Props = {
  search: string;
  onSearch: (value: string) => void;
  onAdd: () => void;
};

export function Header({ search, onSearch, onAdd }: Props) {
  return (
    <header className="relative overflow-hidden border-b border-line bg-surface/80 backdrop-blur-md">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, rgba(183,110,121,0.12), transparent 35%), radial-gradient(circle at 80% 0%, rgba(212,196,176,0.35), transparent 40%)",
        }}
      />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] text-rose uppercase">
              <Sparkles size={14} /> Closet pessoal
            </p>
            <h1 className="font-display mt-2 text-[clamp(2.4rem,6vw,3.8rem)] leading-[0.95] font-semibold text-brown-deep">
              Meu Closet dos Sonhos
            </h1>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
              Tudo o que eu amo, desejo e escolho para o meu estilo.
            </p>
          </div>
          <button type="button" className="btn-primary self-start lg:self-auto" onClick={onAdd}>
            + Adicionar nova peça
          </button>
        </div>

        <label className="relative block max-w-xl">
          <Search
            size={18}
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted"
          />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Buscar por nome, marca ou loja..."
            className="w-full rounded-full border border-line bg-cream/60 py-3 pr-4 pl-11 text-sm text-ink outline-none transition focus:border-rose focus:bg-surface focus:ring-4 focus:ring-rose/10"
          />
        </label>
      </div>
    </header>
  );
}
