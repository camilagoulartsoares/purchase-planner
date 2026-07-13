import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { LoginPage, RegisterPage } from "./pages/AuthPages";
import { HomePage } from "./pages/HomePage";
import { BrandsPage } from "./pages/BrandsPage";
import { BrandPage } from "./pages/BrandPage";
import { ProductDetailPage } from "./pages/ProductDetailPage";
import type { ReactNode } from "react";
import { AppBootSkeleton } from "./components/Skeletons";

function Private({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return <AppBootSkeleton />;
  }
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
        <Route path="/marcas" element={<Private><BrandsPage /></Private>} />
        <Route path="/marcas/:slug" element={<Private><BrandPage /></Private>} />
        <Route path="/marcas/:slug/:category" element={<Private><BrandPage /></Private>} />
        <Route path="/produtos/:id" element={<Private><ProductDetailPage /></Private>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
