import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { LoginPage, RegisterPage } from "./pages/AuthPages";
import { HomePage } from "./pages/HomePage";
import type { ReactNode } from "react";

function Private({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="grid min-h-screen place-items-center text-muted">Carregando...</p>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/" element={<Private><HomePage /></Private>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
