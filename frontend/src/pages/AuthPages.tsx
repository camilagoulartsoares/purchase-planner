import { useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function LoginPage() {
  const { login, user } = useAuth();
  const [email, setEmail] = useState("camilagoulartsoares@yahoo.com");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(email, password);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Não foi possível entrar. Verifique e-mail e senha.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <form onSubmit={onSubmit} className="card-soft w-full max-w-md p-6 sm:p-8">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-rose uppercase">Bem-vinda</p>
        <h1 className="font-display mt-2 text-3xl font-semibold text-brown-deep">Entrar no closet</h1>
        <p className="mt-2 text-sm text-muted">Organize com calma o que deseja comprar ao longo do tempo.</p>
        <div className="mt-6 grid gap-3">
          <label className="field">
            <span>E-mail</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="field">
            <span>Senha</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error ? <p className="text-sm text-rose-deep">{error}</p> : null}
          <button className="btn-primary mt-2" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </div>
        <p className="mt-4 text-center text-sm text-muted">
          Ainda não tem conta? <Link className="text-rose" to="/register">Criar conta</Link>
        </p>
      </form>
    </div>
  );
}

export function RegisterPage() {
  const { register, user } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await register(name, email, password);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Não foi possível criar a conta.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <form onSubmit={onSubmit} className="card-soft w-full max-w-md p-6 sm:p-8">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-rose uppercase">Começar</p>
        <h1 className="font-display mt-2 text-3xl font-semibold text-brown-deep">Criar conta</h1>
        <div className="mt-6 grid gap-3">
          <label className="field">
            <span>Nome</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="field">
            <span>E-mail</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="field">
            <span>Senha</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
          </label>
          {error ? <p className="text-sm text-rose-deep">{error}</p> : null}
          <button className="btn-primary mt-2" disabled={loading}>
            {loading ? "Criando..." : "Criar conta"}
          </button>
        </div>
        <p className="mt-4 text-center text-sm text-muted">
          Já tem conta? <Link className="text-rose" to="/login">Entrar</Link>
        </p>
      </form>
    </div>
  );
}
