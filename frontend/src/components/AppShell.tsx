import { Link, NavLink } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import type { ReactNode } from "react";

export function AppShell({
  children,
  actions,
}: {
  children: ReactNode;
  actions?: ReactNode;
}) {
  const { user, logout } = useAuth();

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-full px-3 py-1.5 text-sm transition ${
      isActive ? "bg-rose text-white" : "text-brown-deep hover:bg-cream-deep"
    }`;

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.16em] text-rose uppercase">
                Uso pessoal
              </p>
              <Link to="/" className="font-display text-3xl font-semibold text-brown-deep">
                Meu Closet dos Sonhos
              </Link>
              <p className="mt-1 text-sm text-muted">Olá, {user?.name}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {actions}
              <button type="button" className="btn-ghost" onClick={logout}>
                <LogOut size={14} /> Sair
              </button>
            </div>
          </div>
          <nav className="flex flex-wrap gap-2">
            <NavLink to="/" end className={linkClass}>
              Peças
            </NavLink>
            <NavLink to="/marcas" className={linkClass}>
              Marcas
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
