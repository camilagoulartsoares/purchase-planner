import { Link, NavLink } from "react-router-dom";
import { LayoutGrid, LogOut, Sparkles, Tags } from "lucide-react";
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
    `app-nav-link ${isActive ? "is-active" : ""}`;

  return (
    <div className="min-h-screen">
      <header className="app-header">
        <div className="app-header-inner mx-auto max-w-6xl px-4 sm:px-6">
          <div className="app-brand-row">
            <div className="app-brand-wrap">
              <Link to="/" className="app-brand-mark" aria-label="Ir para o início">
                <Sparkles size={19} />
              </Link>
              <div>
                <p className="app-eyebrow">Seu closet inteligente</p>
                <Link to="/" className="app-brand-name font-display">
                  Purchase Planner
                </Link>
                <p className="app-welcome">Olá, {user?.name}</p>
              </div>
            </div>
            <div className="app-header-actions">
              {actions}
              <button type="button" className="btn-ghost" onClick={logout}>
                <LogOut size={14} /> Sair
              </button>
            </div>
          </div>
          <nav className="app-nav" aria-label="Navegação principal">
            <NavLink to="/" end className={linkClass}>
              <LayoutGrid size={15} /> Registros
            </NavLink>
            <NavLink to="/marcas" className={linkClass}>
              <Tags size={15} /> Marcas
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
