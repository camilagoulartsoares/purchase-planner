export function formatOfferCheckedAt(iso?: string | null, now = new Date()) {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfThat = new Date(at.getFullYear(), at.getMonth(), at.getDate());
  const days = Math.round((startOfToday.getTime() - startOfThat.getTime()) / 86_400_000);
  if (days <= 0) return `Verificado hoje às ${at.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  if (days === 1) return "Verificado ontem";
  if (days < 7) return `Preço verificado há ${days} dias`;
  return `Preço verificado em ${at.toLocaleDateString("pt-BR")}`;
}

export function sanitizeShopperUserError(message?: string | null, mode: "search" | "refresh" = "search") {
  if (mode === "refresh") return "Não foi possível atualizar os preços agora.";
  const text = (message || "").trim();
  if (!text || /serpapi|searchapi|quota|http\s*429|\bapi\b/i.test(text)) {
    return "Não foi possível buscar novas ofertas agora. Tente novamente mais tarde.";
  }
  return text;
}

export function formatShopperAge(iso?: string | null, now = new Date()) {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const minutes = Math.max(0, Math.floor((now.getTime() - at.getTime()) / 60_000));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} minuto${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} hora${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  return `há ${days} dia${days === 1 ? "" : "s"}`;
}

