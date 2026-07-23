import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Check, ChevronDown, ExternalLink, Gem, Heart, PiggyBank, Repeat2, SlidersHorizontal, Sparkles, Target, X } from "lucide-react";
import * as api from "../api/closet";
import {
  DEPARTMENTS,
  FASHION_CATEGORIES,
  type MercadoLivreIntegrationStatus,
  type MercadoLivrePublicConfig,
  type MercadoLivreSyncResponse,
  NON_FASHION_CATEGORIES,
  STATUSES,
  formatBRL,
  mediaUrl,
  type BrandSummary,
  type ProductQuery,
  type PromoRadarResponse,
  type Product,
  type Summary,
} from "../types";
import { ProductFormModal } from "../components/ProductFormModal";
import { ProductGallery } from "../components/ProductGallery";
import { ProductCard } from "../components/ProductCard";
import { AppShell } from "../components/AppShell";
import { HomeSkeleton, ProductGridSkeleton } from "../components/Skeletons";
import { buildPromoByProductId } from "../utils/promo";

const emptyQuery: ProductQuery & {
  department: "moda" | "achadinhos" | "";
  search: string;
  category: string;
  brand: string;
  store: string;
  color: string;
  size: string;
  priority: string;
  status: string;
  favorite: boolean;
  promo: string;
  minPrice: string;
  maxPrice: string;
  sort: string;
  page: number;
  perPage: number;
} = {
  search: "",
  department: "moda",
  category: "",
  brand: "",
  store: "",
  color: "",
  size: "",
  priority: "",
  status: "Quero comprar",
  favorite: false,
  promo: "",
  minPrice: "",
  maxPrice: "",
  sort: "recentes",
  page: 1,
  perPage: 12,
};

const VISIBLE_STATUSES = STATUSES.filter((s) => s !== STATUSES[1]);
const MIN_FILTER_PRICE = 0;
const MAX_FILTER_PRICE = 2000;
const PRICE_STEP = 10;
const DEFAULT_BUDGET = 400;

const USE_ELIZAH_IMAGES: Record<string, string> = {
  "body-claire-preto": "https://assets.sistemawbuy.com.br/arquivos/a909005735edae32b6bc126d5cb94ec0/produtos/664f932d32ee0/img_1882-669ddf3cebea4_mini.jpeg",
  "calca-cecilia-marrom": "https://assets.sistemawbuy.com.br/arquivos/a909005735edae32b6bc126d5cb94ec0/produtos/683a47417e3fd/2f70b1ec-7de1-4678-b95a-02dd6965c86a-6a5e7b87829ec_mini.png",
  "blusa-eliza-preto": "https://assets.sistemawbuy.com.br/arquivos/a909005735edae32b6bc126d5cb94ec0/produtos/6a0c3f74aac16/img_6921-6a0e55b5636a4_mini.jpeg",
  "regata-jane-cappuccino": "https://assets.sistemawbuy.com.br/arquivos/a909005735edae32b6bc126d5cb94ec0/produtos/6a60996f38913/chatgpt-image-22-de-jul-de-2026-15_09_57-6a6107b40818e_mini.png",
  "conj-isabelle-preto": "https://assets.sistemawbuy.com.br/arquivos/a909005735edae32b6bc126d5cb94ec0/produtos/69e0d0861a268/img_5142-69f0fc3a625d2_mini.jpeg",
  "blusa-elena-marrom": "https://assets.sistemawbuy.com.br/arquivos/a909005735edae32b6bc126d5cb94ec0/produtos/6a312bc53acfb/img_9312-1-6a31997c6ce9a_mini.jpeg",
  "blusa-izzie-preto": "https://assets.sistemawbuy.com.br/arquivos/a909005735edae32b6bc126d5cb94ec0/produtos/69e0d501c6640/img_5154-69ef63e6637f1_mini.jpeg",
  "blusa-eliza-marrom": "https://assets.sistemawbuy.com.br/arquivos/a909005735edae32b6bc126d5cb94ec0/produtos/6a5e61ac1b696/img_0660-6a5e962011d4b_mini.jpeg",
  "body-sabrina-preto": "https://assets.sistemawbuy.com.br/arquivos/a909005735edae32b6bc126d5cb94ec0/produtos/6a4b8d6052648/img_0668-6a4baaff498f4-6a4bab4b85bf0_mini.jpg",
  "short-lea-preto": "https://assets.sistemawbuy.com.br/arquivos/a909005735edae32b6bc126d5cb94ec0/produtos/66a3b94ba2bd9/img_2359-692040ff42d75_mini.jpeg",
  "calca-brenda-off": "https://assets.sistemawbuy.com.br/arquivos/a909005735edae32b6bc126d5cb94ec0/produtos/6970e471f2ba5/image00028-69714e723b1e1_mini.jpeg",
  "body-mavie-inv-marrom": "https://assets.sistemawbuy.com.br/arquivos/a909005735edae32b6bc126d5cb94ec0/produtos/6a3129551fe0e/1e76ce2c-bcae-4290-979c-704ca778e3c9-6a57d19e1ec95_mini.jpg",
};

const USE_ELIZAH_PROMOS: PromoRadarResponse["externalPromotions"] = ([
  ["body-claire-preto", "Body Claire Preto", "Bodies", "Preto", 59.9, 37],
  ["calca-cecilia-marrom", "Calça Cecília Marrom", "Calças", "Marrom", 129.9, 79.9],
  ["blusa-eliza-preto", "Blusa Eliza Preto", "Blusas", "Preto", 59.9, 45],
  ["regata-jane-cappuccino", "Regata Jane Cappuccino", "Blusas", "Cappuccino", 49.9, 27.9],
  ["conj-isabelle-preto", "Conjunto Isabelle Preto", "Conjuntos", "Preto", 119.9, 79.9],
  ["blusa-elena-marrom", "Blusa Elena Marrom", "Blusas", "Marrom", 49.9, 29.9],
  ["blusa-izzie-preto", "Blusa Izzie Preto", "Blusas", "Preto", 69.9, 45],
  ["blusa-eliza-marrom", "Blusa Eliza Marrom", "Blusas", "Marrom", 59.9, 45],
  ["body-sabrina-preto", "Body Sabrina Preto", "Bodies", "Preto", 59.9, 39.9],
  ["short-lea-preto", "Short Lea Preto", "Shorts", "Preto", 99.9, 69.9],
  ["calca-brenda-off", "Calça Brenda Off", "Calças", "Off white", 129.9, 94.9],
  ["body-mavie-inv-marrom", "Body Mavie Marrom", "Bodies", "Marrom", 69.9, 39.9],
] as Array<[string, string, string, string, number, number]>).map(([slug, name, category, color, originalPrice, salePrice]) => ({
  id: `use-elizah-${slug}`,
  brand: "Elizah",
  name,
  category,
  color,
  originalPrice,
  salePrice,
  discountPercentage: Math.round(((originalPrice - salePrice) / originalPrice) * 100),
  purchaseUrl: `https://www.useelizah.com.br/${slug}/`,
  imageUrl: USE_ELIZAH_IMAGES[slug] || null,
  detectedAt: "2026-07-22T00:00:00.000Z",
}));

type PlannerCandidate = Product & {
  plannerKey: string;
  plannerSource: "wishlist" | "repurchase";
  plannerQuantity: number;
};

type BuyingState = {
  item: PlannerCandidate | Product;
  repurchase: boolean;
};

const priorityScore: Record<string, number> = {
  "Quero muito": 3,
  Quero: 2,
  Talvez: 1,
};

const plannerItemScore = (item: Product, source: "wishlist" | "repurchase" = "wishlist", quantity = 1) =>
  (priorityScore[item.priority] || 0) * 1000 +
  item.discountPercent * 12 +
  (item.isFavorite ? 180 : 0) +
  Math.max(0, 220 - item.effectivePrice / 5) +
  (source === "wishlist" ? 120 : 40) -
  (quantity - 1) * 90;

const plannerImage = (item: Product) =>
  mediaUrl(item.images?.find((image) => image.isMain)?.imageUrl || item.imageUrl);

const productImages = (product: Product) =>
  product.images?.length
    ? product.images
    : product.imageUrl
      ? [{ imageUrl: product.imageUrl }]
      : [];

const today = () => new Date().toISOString().slice(0, 10);

function syncTabParam(department: "moda" | "achadinhos" | "") {
  const params = new URLSearchParams(window.location.search);
  if (department === "achadinhos") params.set("tab", "achadinhos");
  else params.delete("tab");
  const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
  window.history.replaceState({}, "", next);
}

function SelectField({
  value,
  onChange,
  options,
  label,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  label: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) || options[0];

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className={`select-pretty ${className}`} ref={ref}>
      <span>{label}</span>
      <button
        type="button"
        className="select-pretty-trigger"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{selected?.label}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open ? (
        <div className="select-pretty-menu" role="listbox">
          {options.map((option) => (
            <button
              key={option.value || "all"}
              type="button"
              className={`select-pretty-option ${option.value === value ? "is-selected" : ""}`}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              role="option"
              aria-selected={option.value === value}
            >
              <span>{option.label}</span>
              {option.value === value ? <Check size={14} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function HomePage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [brands, setBrands] = useState<BrandSummary[]>([]);
  const [promoRadar, setPromoRadar] = useState<PromoRadarResponse | null>(null);
  const [items, setItems] = useState<Product[]>([]);
  const [plannerItems, setPlannerItems] = useState<Product[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, perPage: 12, totalPages: 1 });
  const [query, setQuery] = useState(emptyQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(emptyQuery);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [addingPromotionId, setAddingPromotionId] = useState("");
  const [dismissedPromos, setDismissedPromos] = useState<string[]>(() => {
    try {
      return JSON.parse(window.localStorage.getItem("purchase-planner-dismissed-promos") || "[]");
    } catch {
      return [];
    }
  });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [buying, setBuying] = useState<BuyingState | null>(null);
  const [comboPreview, setComboPreview] = useState<PlannerCandidate | Product | null>(null);
  const [paid, setPaid] = useState("");
  const [buyDate, setBuyDate] = useState(today);
  const [buyNotes, setBuyNotes] = useState("");
  const [meliConfig, setMeliConfig] = useState<MercadoLivrePublicConfig | null>(null);
  const [meliStatus, setMeliStatus] = useState<MercadoLivreIntegrationStatus | null>(null);
  const [meliSyncResult, setMeliSyncResult] = useState<MercadoLivreSyncResponse | null>(null);
  const [meliLoading, setMeliLoading] = useState(false);
  const [monthlyBudget, setMonthlyBudget] = useState(() => {
    const stored = window.localStorage.getItem("purchase-planner-budget");
    return stored ? Number(stored) || DEFAULT_BUDGET : DEFAULT_BUDGET;
  });
  const [allowRepurchase, setAllowRepurchase] = useState(() => {
    const stored = window.localStorage.getItem("purchase-planner-allow-repurchase");
    return stored ? stored === "true" : true;
  });
  const [allowDuplicates, setAllowDuplicates] = useState(() => {
    const stored = window.localStorage.getItem("purchase-planner-allow-duplicates");
    return stored ? stored === "true" : true;
  });
  const [allowRemainder, setAllowRemainder] = useState(() => {
    const stored = window.localStorage.getItem("purchase-planner-allow-remainder");
    return stored ? stored === "true" : true;
  });
  const promoRetryTimeoutRef = useRef<number | null>(null);
  const promoRetryCountRef = useRef(0);
  const refreshPromoRadarRef = useRef<(() => Promise<void>) | null>(null);

  const promoByProductId = useMemo(
    () => buildPromoByProductId(promoRadar?.products || []),
    [promoRadar],
  );
  const externalPromotions = useMemo(
    () => ((promoRadar?.externalPromotions === undefined ? USE_ELIZAH_PROMOS : promoRadar.externalPromotions)).filter((item) => !dismissedPromos.includes(item.id)),
    [dismissedPromos, promoRadar],
  );

  const refreshMercadoLivreStatus = useCallback(async () => {
    try {
      const [config, status] = await Promise.all([
        api.fetchMercadoLivrePublicConfig(),
        api.fetchMercadoLivreStatus(),
      ]);
      setMeliConfig(config);
      setMeliStatus(status);
    } catch {
      try {
        const config = await api.fetchMercadoLivrePublicConfig();
        setMeliConfig(config);
      } catch {
        setMeliConfig(null);
      }
      setMeliStatus(null);
    }
  }, []);

  const clearPromoRetry = useCallback(() => {
    if (promoRetryTimeoutRef.current != null) {
      window.clearTimeout(promoRetryTimeoutRef.current);
      promoRetryTimeoutRef.current = null;
    }
  }, []);

  const refreshPromoRadar = useCallback(async () => {
    clearPromoRetry();
    try {
      const promo = await api.fetchPromoRadar();
      setPromoRadar(promo);
      const hasTrackableItems = items.some((item) => Boolean(item.purchaseUrl));
      if (promo.products.length === 0 && hasTrackableItems && promoRetryCountRef.current < 2) {
        promoRetryCountRef.current += 1;
        promoRetryTimeoutRef.current = window.setTimeout(() => {
          void refreshPromoRadarRef.current?.();
        }, 3500);
        return;
      }
      promoRetryCountRef.current = 0;
    } catch {
      setToast((current) => current || "Radar de promoções indisponível no momento");
    }
  }, [clearPromoRetry, items]);

  const connectMercadoLivre = useCallback(async () => {
    setMeliLoading(true);
    try {
      const redirectTo = `${window.location.pathname}?tab=achadinhos`;
      const data = await api.createMercadoLivreConnect(redirectTo);
      window.location.href = data.authorizationUrl;
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Nao foi possivel iniciar a conexao com Mercado Livre");
      setMeliLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const fetchPlannerItems = async () => {
        const first = await api.fetchProducts({ ...debouncedQuery, page: 1, perPage: 50 });
        if (first.meta.totalPages <= 1) return first.items;

        const rest = await Promise.all(
          Array.from({ length: first.meta.totalPages - 1 }, (_, index) =>
            api.fetchProducts({ ...debouncedQuery, page: index + 2, perPage: 50 }),
          ),
        );

        return [...first.items, ...rest.flatMap((page) => page.items)];
      };

      const [s, p, b, plannerProducts] = await Promise.all([
        api.fetchSummary(),
        api.fetchProducts(debouncedQuery),
        api.fetchBrands(),
        fetchPlannerItems(),
      ]);
      setSummary(s);
      setItems(p.items);
      setPlannerItems(plannerProducts);
      setMeta(p.meta);
      setBrands(b);
    } catch {
      setToast("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery]);

  const syncMercadoLivre = useCallback(async () => {
    setMeliLoading(true);
    try {
      const result = await api.syncMercadoLivreFavorites();
      setMeliSyncResult(result);
      await Promise.all([load(), refreshMercadoLivreStatus()]);
      setToast(`Mercado Livre sincronizado: ${result.importedCount} criados, ${result.updatedCount} atualizados`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Falha ao sincronizar favoritos do Mercado Livre");
    } finally {
      setMeliLoading(false);
    }
  }, [load, refreshMercadoLivreStatus]);

  const disconnectMercadoLivre = useCallback(async () => {
    setMeliLoading(true);
    try {
      await api.disconnectMercadoLivre();
      setMeliStatus((current) =>
        current
          ? {
              ...current,
              connected: false,
              nickname: null,
              meliUserId: null,
              lastSyncedAt: null,
              syncStatus: "idle",
              syncError: null,
            }
          : current,
      );
      setToast("Mercado Livre desconectado");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Falha ao desconectar Mercado Livre");
    } finally {
      setMeliLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void refreshMercadoLivreStatus();
  }, [refreshMercadoLivreStatus]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") !== "achadinhos") return;
    setQuery((current) =>
      current.department === "achadinhos"
        ? current
        : {
            ...current,
            department: "achadinhos",
            category: "",
            page: 1,
          },
    );
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const meli = params.get("meli");
    const message = params.get("message");
    if (!meli && !message) return;

    if (meli === "connected") {
      void refreshMercadoLivreStatus();
      setToast("Mercado Livre conectado");
    } else if (message) {
      setToast(message);
    }

    params.delete("meli");
    params.delete("message");
    params.delete("nickname");
    const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
    window.history.replaceState({}, "", next);
  }, [refreshMercadoLivreStatus]);

  useEffect(() => {
    refreshPromoRadarRef.current = refreshPromoRadar;
  }, [refreshPromoRadar]);

  useEffect(() => {
    if (loading || promoRadar) return;
    void refreshPromoRadar();
  }, [loading, promoRadar, refreshPromoRadar]);

  useEffect(() => () => clearPromoRetry(), [clearPromoRetry]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    window.localStorage.setItem("purchase-planner-budget", String(monthlyBudget));
  }, [monthlyBudget]);

  useEffect(() => {
    window.localStorage.setItem("purchase-planner-allow-repurchase", String(allowRepurchase));
  }, [allowRepurchase]);

  useEffect(() => {
    window.localStorage.setItem("purchase-planner-allow-duplicates", String(allowDuplicates));
  }, [allowDuplicates]);

  useEffect(() => {
    window.localStorage.setItem("purchase-planner-allow-remainder", String(allowRemainder));
  }, [allowRemainder]);

  const patch = (partial: Partial<typeof query>) =>
    setQuery((q) => ({ ...q, ...partial, page: partial.page ?? 1 }));

  const priceMin = query.minPrice === "" ? MIN_FILTER_PRICE : Number(query.minPrice);
  const priceMax = query.maxPrice === "" ? MAX_FILTER_PRICE : Number(query.maxPrice);

  const setPriceMin = (value: number) => {
    const next = Math.min(value, priceMax - PRICE_STEP);
    patch({ minPrice: next <= MIN_FILTER_PRICE ? "" : String(next) });
  };

  const setPriceMax = (value: number) => {
    const next = Math.max(value, priceMin + PRICE_STEP);
    patch({ maxPrice: next >= MAX_FILTER_PRICE ? "" : String(next) });
  };

  const priceStart = ((priceMin - MIN_FILTER_PRICE) / (MAX_FILTER_PRICE - MIN_FILTER_PRICE)) * 100;
  const priceEnd = ((priceMax - MIN_FILTER_PRICE) / (MAX_FILTER_PRICE - MIN_FILTER_PRICE)) * 100;

  const planner = useMemo(() => {
    const wanted = plannerItems.filter(
      (item) => item.status !== "Já comprei" && item.status !== "Desisti da compra",
    );
    const repurchasable = plannerItems.filter((item) => item.status === "Já comprei");
    const total = wanted.reduce((sum, item) => sum + item.effectivePrice, 0);

    const baseCandidates: PlannerCandidate[] = [
      ...wanted.map((item) => ({
        ...item,
        plannerKey: `wishlist-${item.id}-1`,
        plannerSource: "wishlist" as const,
        plannerQuantity: 1,
      })),
      ...(allowRepurchase
        ? repurchasable.map((item) => ({
            ...item,
            plannerKey: `repurchase-${item.id}-1`,
            plannerSource: "repurchase" as const,
            plannerQuantity: 1,
          }))
        : []),
    ];

    const expandedCandidates = baseCandidates.flatMap((item) => {
      const maxUnits = allowDuplicates
        ? Math.min(3, Math.max(1, Math.floor(monthlyBudget / Math.max(item.effectivePrice, 1))))
        : 1;

      return Array.from({ length: maxUnits }, (_, index) => ({
        ...item,
        plannerKey: `${item.plannerSource}-${item.id}-${index + 1}`,
        plannerQuantity: index + 1,
      }));
    });

    const compareCandidates = (a: PlannerCandidate, b: PlannerCandidate) =>
      plannerItemScore(b, b.plannerSource, b.plannerQuantity) -
        plannerItemScore(a, a.plannerSource, a.plannerQuantity) ||
      a.effectivePrice - b.effectivePrice;

    const onBudget = expandedCandidates
      .filter((item) => item.effectivePrice <= monthlyBudget)
      .sort(compareCandidates);
    const withinBudgetCount = baseCandidates.filter((item) => item.effectivePrice <= monthlyBudget).length;
    const topPick = onBudget[0] || null;
    const planCandidates = onBudget.slice(0, allowDuplicates ? 28 : 18);

    const comparePlans = (
      current: { items: PlannerCandidate[]; spent: number; score: number },
      next: { items: PlannerCandidate[]; spent: number; score: number },
    ) => {
      const currentGap = Math.max(0, monthlyBudget - current.spent);
      const nextGap = Math.max(0, monthlyBudget - next.spent);

      if (!allowRemainder && currentGap !== nextGap) return nextGap < currentGap ? next : current;
      if (next.score !== current.score) return next.score > current.score ? next : current;
      if (next.items.length !== current.items.length) {
        return next.items.length > current.items.length ? next : current;
      }
      if (next.spent !== current.spent) return next.spent > current.spent ? next : current;
      return current;
    };

    const shoppingPlan = planCandidates.reduce(
      (best, item) => {
        const price = item.effectivePrice;
        const score = plannerItemScore(item, item.plannerSource, item.plannerQuantity);
        const nextPlans = best.plans
          .filter((plan) => plan.spent + price <= monthlyBudget)
          .map((plan) => ({
            items: [...plan.items, item],
            spent: plan.spent + price,
            score: plan.score + score,
          }));
        const plans = [...best.plans, ...nextPlans];
        const winner = plans.reduce(comparePlans, best.winner);

        return { plans, winner };
      },
      {
        plans: [{ items: [] as PlannerCandidate[], spent: 0, score: 0 }],
        winner: { items: [] as PlannerCandidate[], spent: 0, score: 0 },
      },
    ).winner;

    const cheapest = baseCandidates.length
      ? baseCandidates.reduce((current, item) =>
          item.effectivePrice < current.effectivePrice ? item : current,
        )
      : null;
    const budgetUse = monthlyBudget > 0 ? Math.min(100, (total / monthlyBudget) * 100) : 100;
    const planRemainder = Math.max(0, monthlyBudget - shoppingPlan.spent);
    const repeatedCount = shoppingPlan.items.filter((item) => item.plannerQuantity > 1).length;
    const repurchaseCount = shoppingPlan.items.filter((item) => item.plannerSource === "repurchase").length;

    return {
      wantedCount: wanted.length,
      total,
      topPick,
      shoppingPlan,
      planRemainder,
      cheapest,
      budgetUse,
      withinBudgetCount,
      candidateCount: baseCandidates.length,
      repeatedCount,
      repurchaseCount,
      strategyLabel: allowRemainder ? "Mais desejo" : "Mais precisão",
      strategyNote: allowRemainder
        ? "Aceita folga para priorizar peças mais fortes, promoções e favoritos."
        : "Tenta encostar no teto do orçamento para montar um combo mais justo.",
    };
  }, [allowDuplicates, allowRemainder, allowRepurchase, monthlyBudget, plannerItems]);

  const resetFilters = () =>
    setQuery({ ...emptyQuery, department: query.department, status: query.status });
  const sortOptions = [
    { value: "recentes", label: "Mais recentes" },
    { value: "antigos", label: "Mais antigos" },
    { value: "menor-preco", label: "Menor preço" },
    { value: "maior-preco", label: "Maior preço" },
    { value: "maior-desconto", label: "Maior desconto" },
    { value: "nome", label: "Nome" },
    { value: "marca", label: "Marca" },
  ];
  const brandOptions = [
    { value: "", label: "Todas" },
    ...brands.map((brand) => ({ value: brand.name, label: brand.name })),
  ];
  const categoryOptions = [
    { value: "", label: "Todas" },
    ...(query.department === "achadinhos" ? NON_FASHION_CATEGORIES : FASHION_CATEGORIES).map((category) => ({ value: category, label: category })),
  ];

  const onSave = async (form: FormData, id?: string) => {
    await api.saveProduct(form, id);
    setToast(id ? "Peça atualizada" : "Peça adicionada");
    await load();
    void refreshPromoRadar();
  };

  const addExternalPromotion = async (promotion: NonNullable<PromoRadarResponse["externalPromotions"]>[number]) => {
    if (addingPromotionId) return;
    setAddingPromotionId(promotion.id);
    const form = new FormData();
    form.set("name", promotion.name);
    form.set("category", promotion.category);
    form.set("brand", promotion.brand);
    form.set("store", "Use Elizah");
    form.set("originalPrice", String(promotion.originalPrice));
    form.set("promotionalPrice", String(promotion.salePrice));
    form.set("purchaseUrl", promotion.purchaseUrl);
    form.set("color", promotion.color || "");
    form.set("imageUrl", promotion.imageUrl || "");
    form.set("priority", "Quero");
    form.set("status", "Quero comprar");
    form.set("notes", `Promoção detectada pelo radar: ${promotion.discountPercentage}% OFF.`);
    try {
      await onSave(form);
      setToast(`✓ ${promotion.name} foi adicionada à sua lista`);
    } finally {
      setAddingPromotionId("");
    }
  };

  const dismissExternalPromotion = (id: string) => {
    setDismissedPromos((current) => {
      const next = [...new Set([...current, id])];
      window.localStorage.setItem("purchase-planner-dismissed-promos", JSON.stringify(next));
      return next;
    });
  };

  const openBuyModal = (item: Product | PlannerCandidate, repurchase = false) => {
    setBuying({ item, repurchase });
    setPaid(String(item.effectivePrice));
    setBuyDate(today());
    setBuyNotes("");
  };

  const onStatus = async (item: Product, status: string) => {
    if (status === "Já comprei") {
      openBuyModal(item);
      return;
    }
    await api.patchStatus(item.id, { status });
    setToast("Status atualizado");
    await load();
    void refreshPromoRadar();
  };

  const confirmBuy = async () => {
    if (!buying) return;
    await api.patchStatus(buying.item.id, {
      status: "Já comprei",
      purchasedPrice: Number(paid),
      purchasedAt: buyDate,
      notes: buyNotes || undefined,
      repurchase: buying.repurchase,
    });
    setBuying(null);
    setToast(buying.repurchase ? "Recompra registrada" : "Registrada como comprada");
    await load();
    void refreshPromoRadar();
  };

  return (
    <AppShell
      actions={
        <button
          className="btn-primary"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          + Adicionar peça
        </button>
      }
    >
      {loading && !summary ? (
        <HomeSkeleton />
      ) : (
        <>
      {summary ? (
        <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Desejados", String(summary.wantCount)],
            ["Comprados", String(summary.boughtCount)],
            ["Total desejos", formatBRL(summary.wishTotal)],
            ["Total gasto", formatBRL(summary.spentTotal)],
          ].map(([label, value]) => (
            <article key={label} className="card-soft p-4">
              <p className="text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">{label}</p>
              <p className="font-display mt-1 text-2xl font-semibold text-brown-deep">{value}</p>
            </article>
          ))}
        </section>
      ) : null}

      <section className="planner-panel mb-6">
        <div className="planner-panel-main planner-panel-main-spotlight">
          <div className="planner-panel-top">
            <div>
              <p className="planner-kicker">
                <Sparkles size={15} /> Planejador inteligente
              </p>
              <h2 className="font-display mt-2 text-3xl font-semibold text-brown-deep">
                {planner.topPick
                  ? "Seu próximo movimento de compra"
                  : `Nada até ${formatBRL(monthlyBudget)}`}
              </h2>
              <p className="planner-lead">
                {planner.topPick
                  ? "Agora o planner mistura wishlist, recompra e repetição para montar um cenário mais útil." 
                  : "Ajuste o orçamento e os modos do planner para descobrir uma direção melhor."}
              </p>
            </div>
            <div className="planner-budget-control">
              <label htmlFor="monthly-budget">Orçamento</label>
              <input
                id="monthly-budget"
                type="text"
                inputMode="numeric"
                value={String(monthlyBudget)}
                onChange={(event) => {
                  const digits = event.target.value.replace(/\D/g, "");
                  const normalized = digits.replace(/^0+(?=\d)/, "");
                  setMonthlyBudget(normalized ? Number(normalized) : 0);
                }}
              />
            </div>
          </div>

          <div className="planner-strategy-row">
            <button
              type="button"
              className={`planner-toggle ${allowRepurchase ? "is-active" : ""}`}
              onClick={() => setAllowRepurchase((value) => !value)}
              aria-pressed={allowRepurchase}
            >
              <Repeat2 size={15} /> Incluir recompras
            </button>
            <button
              type="button"
              className={`planner-toggle ${allowDuplicates ? "is-active" : ""}`}
              onClick={() => setAllowDuplicates((value) => !value)}
              aria-pressed={allowDuplicates}
            >
              <Sparkles size={15} /> Permitir repetição
            </button>
            <button
              type="button"
              className={`planner-toggle ${allowRemainder ? "is-active" : ""}`}
              onClick={() => setAllowRemainder((value) => !value)}
              aria-pressed={allowRemainder}
            >
              <Target size={15} /> Aceitar sobra
            </button>
          </div>

          <div className="planner-strategy-note">
            <span><Target size={15} /> {planner.strategyLabel}</span>
            <p>{planner.strategyNote}</p>
          </div>

          {planner.topPick ? (
            <div className="planner-pick planner-pick-spotlight">
              <div className="planner-pick-media">
                {plannerImage(planner.topPick) ? (
                  <img
                    src={plannerImage(planner.topPick)}
                    alt={planner.topPick.name}
                    className="planner-pick-image"
                  />
                ) : (
                  <div className="planner-pick-image planner-pick-image-empty">Sem foto</div>
                )}
              </div>
              <div className="planner-pick-copy">
                <div className="planner-pick-tags">
                  {planner.topPick.plannerSource === "repurchase" ? (
                    <span className="planner-badge">Comprar de novo</span>
                  ) : null}
                  {planner.topPick.plannerQuantity > 1 ? (
                    <span className="planner-badge">{planner.topPick.plannerQuantity}x no combo</span>
                  ) : null}
                </div>
                <p className="text-xs font-semibold tracking-[0.1em] text-muted uppercase">
                  {planner.topPick.brand} · {planner.topPick.category}
                </p>
                <p className="mt-1 text-xl font-semibold text-ink">{planner.topPick.name}</p>
                <p className="mt-1 text-sm text-muted">
                  {planner.topPick.priority} por {formatBRL(planner.topPick.effectivePrice)}
                  {planner.topPick.discountPercent > 0
                    ? `, com ${planner.topPick.discountPercent}% de desconto`
                    : ""}
                </p>
              </div>
              <button
                type="button"
                className="btn-primary"
                onClick={() => openBuyModal(planner.topPick, planner.topPick.plannerSource === "repurchase")}
              >
                Registrar compra
              </button>
            </div>
          ) : (
            <p className="mt-5 text-sm text-muted">
              {planner.cheapest
                ? `A peça mais barata da lista custa ${formatBRL(planner.cheapest.effectivePrice)}. Aumente o orçamento para ver uma sugestão.`
                : "Quando houver peças na lista, este painel aponta a melhor compra dentro do seu orçamento."}
            </p>
          )}

          {planner.shoppingPlan.items.length > 0 ? (
            <div className="planner-shopping-plan planner-shopping-plan-premium">
              <div className="planner-shopping-plan-head">
                <div>
                  <p>Combo sugerido</p>
                  <strong>{formatBRL(planner.shoppingPlan.spent)}</strong>
                </div>
                <div className="planner-shopping-plan-meta">
                  <span>{planner.shoppingPlan.items.length} peça{planner.shoppingPlan.items.length > 1 ? "s" : ""}</span>
                  {allowRemainder && planner.planRemainder > 0 ? <span>Folga {formatBRL(planner.planRemainder)}</span> : null}
                </div>
              </div>
              <div className="planner-shopping-list">
                {planner.shoppingPlan.items.slice(0, 5).map((item) => (
                  <button
                    key={item.plannerKey}
                    type="button"
                    className="planner-shopping-item"
                    aria-label={`Ver detalhes de ${item.name}`}
                    onClick={() => setComboPreview(item)}
                  >
                    <div className="planner-shopping-item-main">
                      {plannerImage(item) ? (
                        <img
                          src={plannerImage(item)}
                          alt={item.name}
                          className="planner-shopping-thumb"
                        />
                      ) : (
                        <div className="planner-shopping-thumb planner-shopping-thumb-empty" />
                      )}
                      <div>
                        <span>{item.name}</span>
                        <small className="planner-shopping-item-note">
                          {item.plannerSource === "repurchase" ? "Recompra" : "Wishlist"}
                          {item.plannerQuantity > 1 ? ` · ${item.plannerQuantity}ª unidade` : ""}
                        </small>
                      </div>
                    </div>
                    <strong>{formatBRL(item.effectivePrice)}</strong>
                  </button>
                ))}
              </div>
              <p className="planner-shopping-hint">Clique em uma peça para abrir os detalhes sem sair da página.</p>
              {planner.shoppingPlan.items.length > 5 ? (
                <p className="planner-shopping-extra">
                  +{planner.shoppingPlan.items.length - 5} peça
                  {planner.shoppingPlan.items.length - 5 > 1 ? "s" : ""} no combo
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="planner-panel-side">
          <article>
            <span><PiggyBank size={16} /> Lista atual</span>
            <strong>{formatBRL(planner.total)}</strong>
            <div className="planner-meter" aria-hidden="true">
              <span style={{ width: `${planner.budgetUse}%` }} />
            </div>
          </article>
          <article>
            <span><Gem size={16} /> Cabem no orçamento</span>
            <strong>
              {planner.withinBudgetCount} de {planner.candidateCount}
            </strong>
            <small>
              {planner.withinBudgetCount > 0
                ? `Até ${formatBRL(monthlyBudget)}, considerando wishlist e recompras`
                : `Nenhuma peça até ${formatBRL(monthlyBudget)}`}
            </small>
          </article>
          <article>
            <span><Repeat2 size={16} /> Elasticidade do combo</span>
            <strong>{planner.repurchaseCount + planner.repeatedCount}</strong>
            <small>
              {planner.repurchaseCount > 0 ? `${planner.repurchaseCount} recompra${planner.repurchaseCount > 1 ? "s" : ""}` : "Nenhuma recompra"}
              {planner.repeatedCount > 0 ? ` · ${planner.repeatedCount} repetição${planner.repeatedCount > 1 ? "ões" : ""}` : ""}
            </small>
          </article>
        </div>
      </section>

      {promoRadar?.brands.length || externalPromotions.length ? (
        <section className="card-soft mb-6 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="planner-kicker">
                <Sparkles size={15} /> Promo radar
              </p>
              <h3 className="font-display mt-2 text-3xl font-semibold text-brown-deep">
                Promoções reais detectadas esta semana
              </h3>
              <p className="mt-2 max-w-3xl text-sm text-muted">
                Esse painel faz busca nas páginas das peças que você salvou e tenta validar sinais reais
                de campanha, desconto e preço menor no site.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {externalPromotions.length ? (
              <article className="planner-shopping-plan">
                <div className="planner-shopping-plan-head">
                  <div>
                    <p>Use Elizah</p>
                    <strong>{externalPromotions.length} ofertas novas</strong>
                  </div>
                  <div className="planner-shopping-plan-meta"><span>useelizah.com.br</span></div>
                </div>
                <p className="mt-3 text-sm text-ink">Promoções encontradas diretamente na loja.</p>
                <div className="planner-shopping-list external-promo-list">
                  {externalPromotions.map((item) => (
                    <div key={item.id} className="planner-shopping-item">
                      <div className="planner-shopping-item-main">
                        {item.imageUrl ? (
                          <img src={mediaUrl(item.imageUrl)} alt={item.name} className="planner-shopping-thumb" />
                        ) : (
                          <div className="planner-shopping-thumb planner-shopping-thumb-empty" />
                        )}
                        <div>
                          <a href={item.purchaseUrl} target="_blank" rel="noreferrer"><span>{item.name}</span></a>
                          <small className="planner-shopping-item-note">{item.discountPercentage}% OFF · de {formatBRL(item.originalPrice)}</small>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <strong>{formatBRL(item.salePrice)}</strong>
                        <div className="flex gap-2">
                          <button type="button" className="btn-ghost" onClick={() => dismissExternalPromotion(item.id)}>Remover</button>
                          <button type="button" className="btn-primary" disabled={Boolean(addingPromotionId)} onClick={() => void addExternalPromotion(item)}>{addingPromotionId === item.id ? "Adicionando..." : "Adicionar"}</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ) : null}
            {(promoRadar?.brands || []).map((brand) => (
              <article key={brand.brandId} className="planner-shopping-plan">
                <div className="planner-shopping-plan-head">
                  <div>
                    <p>{brand.brand}</p>
                    <strong>{brand.matchedProducts.length} alerta{brand.matchedProducts.length > 1 ? "s" : ""}</strong>
                  </div>
                  <div className="planner-shopping-plan-meta">
                    <span>{brand.storeDomain}</span>
                  </div>
                </div>

                <p className="mt-3 text-sm text-ink">{brand.headline}</p>

                <div className="planner-shopping-list">
                  {brand.matchedProducts.slice(0, 3).map((item) => (
                    <a
                      key={`${brand.brandId}-${item.productId}`}
                      className="planner-shopping-item"
                      href={item.finalUrl || item.purchaseUrl || "#"}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <div className="planner-shopping-item-main">
                        {item.imageUrl ? (
                          <img
                            src={mediaUrl(item.imageUrl)}
                            alt={item.productName}
                            className="planner-shopping-thumb"
                          />
                        ) : (
                          <div className="planner-shopping-thumb planner-shopping-thumb-empty" />
                        )}
                        <div>
                          <span>{item.productName}</span>
                          <small className="planner-shopping-item-note">
                            {item.reason || item.evidence[0] || "Promocao confirmada"}
                          </small>
                        </div>
                      </div>
                      <strong>
                        {item.salePrice != null ? formatBRL(item.salePrice) : "Ver site"}
                      </strong>
                    </a>
                  ))}
                </div>

                {brand.campaignUrls.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {brand.campaignUrls.slice(0, 2).map((url) => (
                      <a
                        key={url}
                        className="btn-ghost"
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Ver campanha
                      </a>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <div className="mb-4 flex gap-2 overflow-x-auto">
        {VISIBLE_STATUSES.map((s) => (
          <button
            key={s}
            className={`shrink-0 rounded-full px-4 py-2 text-sm ${
              query.status === s ? "bg-rose text-white" : "border border-line bg-surface"
            }`}
            onClick={() => patch({ status: s })}
          >
            {s} <span className="opacity-70">{summary?.counts[s] ?? 0}</span>
          </button>
        ))}
      </div>

      <section className="card-soft mb-6 space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-2">
            {DEPARTMENTS.map((department) => (
              <button
                key={department.value}
                type="button"
                className={`planner-toggle ${query.department === department.value ? "is-active" : ""}`}
                onClick={() => {
                  syncTabParam(department.value);
                  setQuery((current) => ({
                    ...current,
                    department: department.value,
                    category: "",
                    page: 1,
                  }));
                }}
                aria-pressed={query.department === department.value}
              >
                {department.label}
              </button>
            ))}
          </div>
          <input
            className="filter-input min-w-[220px] flex-1"
            placeholder="Buscar nome, marca ou loja"
            value={query.search}
            onChange={(e) => patch({ search: e.target.value })}
          />
          <SelectField
            label="Ordenar"
            value={query.sort}
            onChange={(sort) => patch({ sort })}
            options={sortOptions}
            className="min-w-[160px]"
          />
          <button
            type="button"
            className={`btn-ghost ${query.favorite ? "filter-chip-active" : ""}`}
            onClick={() => patch({ favorite: !query.favorite })}
            aria-pressed={query.favorite}
          >
            <Heart size={14} className={query.favorite ? "fill-white" : ""} />
            Favoritos
          </button>
          <button
            className="btn-ghost"
            onClick={resetFilters}
          >
            Limpar filtros
          </button>
        </div>
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1.5fr]">
          <SelectField
            label="Marca"
            value={query.brand}
            onChange={(brand) => patch({ brand })}
            options={brandOptions}
          />
          <SelectField
            label="Categoria"
            value={query.category}
            onChange={(category) => patch({ category })}
            options={categoryOptions}
          />
          <div className="price-filter">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                <SlidersHorizontal size={14} /> Preço
              </span>
              <strong className="text-sm text-brown-deep">
                {formatBRL(priceMin)} - {priceMax >= MAX_FILTER_PRICE ? `+${formatBRL(MAX_FILTER_PRICE)}` : formatBRL(priceMax)}
              </strong>
            </div>
            <div
              className="range-wrap"
              style={
                {
                  "--range-start": `${priceStart}%`,
                  "--range-end": `${priceEnd}%`,
                } as CSSProperties
              }
            >
              <input
                type="range"
                min={MIN_FILTER_PRICE}
                max={MAX_FILTER_PRICE}
                step={PRICE_STEP}
                value={priceMin}
                onChange={(e) => setPriceMin(Number(e.target.value))}
                aria-label="Preço mínimo"
              />
              <input
                type="range"
                min={MIN_FILTER_PRICE}
                max={MAX_FILTER_PRICE}
                step={PRICE_STEP}
                value={priceMax}
                onChange={(e) => setPriceMax(Number(e.target.value))}
                aria-label="Preço máximo"
              />
            </div>
            <div className="mt-2 flex justify-between text-[11px] font-semibold text-muted">
              <span>{formatBRL(MIN_FILTER_PRICE)}</span>
              <span>{formatBRL(MAX_FILTER_PRICE)}+</span>
            </div>
            <div className="price-values">
              <span>Min. {formatBRL(priceMin)}</span>
              <span>Max. {priceMax >= MAX_FILTER_PRICE ? `${formatBRL(MAX_FILTER_PRICE)}+` : formatBRL(priceMax)}</span>
            </div>
          </div>
        </div>
      </section>

      {query.department === "achadinhos" ? (
        <section className="card-soft mb-6 p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="planner-kicker">
                <Sparkles size={15} /> Mercado Livre
              </p>
              <h3 className="font-display mt-2 text-3xl font-semibold text-brown-deep">
                Importe seus favoritos para Achadinhos
              </h3>
              <p className="mt-2 max-w-3xl text-sm text-muted">
                Conecte sua conta com OAuth oficial, sincronize favoritos e acompanhe os últimos preços salvos pelo backend.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {!meliConfig?.available ? (
                <button type="button" className="btn-ghost" disabled>
                  Integração indisponível
                </button>
              ) : !meliStatus?.connected ? (
                <button type="button" className="btn-primary" disabled={meliLoading} onClick={() => void connectMercadoLivre()}>
                  Conectar Mercado Livre
                </button>
              ) : (
                <>
                  <button type="button" className="btn-primary" disabled={meliLoading} onClick={() => void syncMercadoLivre()}>
                    Sincronizar favoritos
                  </button>
                  <button type="button" className="btn-ghost" disabled={meliLoading} onClick={() => void disconnectMercadoLivre()}>
                    Desconectar
                  </button>
                </>
              )}
            </div>
          </div>

          {!meliConfig?.available ? (
            <p className="mt-4 text-sm text-muted">
              Configure MELI_CLIENT_ID, MELI_CLIENT_SECRET, MELI_REDIRECT_URI e MELI_TOKEN_ENCRYPTION_KEY no backend para liberar a integração.
            </p>
          ) : null}

          {meliStatus?.connected ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <article className="card-soft p-4">
                <p className="text-xs uppercase tracking-wide text-muted">Conta conectada</p>
                <p className="mt-1 text-lg font-semibold text-brown-deep">{meliStatus.nickname || "Mercado Livre"}</p>
              </article>
              <article className="card-soft p-4">
                <p className="text-xs uppercase tracking-wide text-muted">Última sincronização</p>
                <p className="mt-1 text-sm font-semibold text-brown-deep">
                  {meliStatus.lastSyncedAt ? new Date(meliStatus.lastSyncedAt).toLocaleString("pt-BR") : "Ainda não sincronizado"}
                </p>
              </article>
              <article className="card-soft p-4">
                <p className="text-xs uppercase tracking-wide text-muted">Status</p>
                <p className="mt-1 text-sm font-semibold text-brown-deep">{meliStatus.syncStatus}</p>
              </article>
              <article className="card-soft p-4">
                <p className="text-xs uppercase tracking-wide text-muted">Expiração do token</p>
                <p className="mt-1 text-sm font-semibold text-brown-deep">
                  {meliStatus.tokenExpiresAt ? new Date(meliStatus.tokenExpiresAt).toLocaleString("pt-BR") : "Sem token"}
                </p>
              </article>
            </div>
          ) : null}

          {meliStatus?.syncError ? (
            <p className="mt-4 text-sm text-rose-deep">{meliStatus.syncError}</p>
          ) : null}

          {meliSyncResult ? (
            <div className="mt-4 rounded-2xl border border-line bg-surface p-4 text-sm text-muted">
              <strong className="text-brown-deep">Última sincronização manual</strong>
              <p className="mt-2">
                {meliSyncResult.importedCount} criados, {meliSyncResult.updatedCount} atualizados, {meliSyncResult.unchangedCount} sem mudança,
                {` ${meliSyncResult.noLongerFavoritedCount} marcados como não favoritados e ${meliSyncResult.failedCount} falhas.`}
              </p>
            </div>
          ) : null}
        </section>
      ) : null}


      {loading ? (
        <ProductGridSkeleton />
      ) : items.length === 0 ? (
        <div className="card-soft py-16 text-center">
          <p className="font-display text-2xl text-brown-deep">Nenhuma peça por aqui</p>
          <p className="mt-2 text-sm text-muted">Adicione algo quando quiser, no seu ritmo.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <ProductCard
              key={item.id}
              product={item}
              promoLabel={promoByProductId.get(item.id)?.label ?? null}
              promoCurrentPrice={promoByProductId.get(item.id)?.salePrice ?? null}
              promoReferencePrice={promoByProductId.get(item.id)?.originalPrice ?? null}
              promoDiscountPercentage={promoByProductId.get(item.id)?.discountPercentage ?? null}
              promoPixPrice={promoByProductId.get(item.id)?.pixPrice ?? null}
              onEdit={(p) => {
                setEditing(p);
                setFormOpen(true);
              }}
              onMarkBought={(p) => void onStatus(p, "Já comprei")}
              onFavorite={async (p) => {
                setItems((current) =>
                  current.map((item) =>
                    item.id === p.id ? { ...item, isFavorite: !item.isFavorite } : item,
                  ),
                );
                await api.toggleFavorite(p.id);
                setToast(p.isFavorite ? "Removida dos favoritos" : "Adicionada aos favoritos");
                await load();
                void refreshPromoRadar();
              }}
              onStatus={(p, status) => void onStatus(p, status)}
              onDelete={async (p) => {
                if (!window.confirm(`Excluir definitivamente "${p.name}"?`)) return;
                await api.deleteProduct(p.id);
                setToast("Peça removida");
                await load();
                void refreshPromoRadar();
              }}
            />
          ))}
        </div>
      )}

      {meta.totalPages > 1 ? (
        <div className="mt-6 flex justify-center gap-2">
          <button
            className="btn-ghost"
            disabled={meta.page <= 1}
            onClick={() => patch({ page: meta.page - 1 })}
          >
            Anterior
          </button>
          <span className="px-3 py-2 text-sm text-muted">
            {meta.page} / {meta.totalPages}
          </span>
          <button
            className="btn-ghost"
            disabled={meta.page >= meta.totalPages}
            onClick={() => patch({ page: meta.page + 1 })}
          >
            Próxima
          </button>
        </div>
      ) : null}

      {comboPreview ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-brown-deep/40 p-4"
          onClick={() => setComboPreview(null)}
        >
          <div
            className="card-soft combo-preview-modal w-full max-w-4xl overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="combo-preview-close"
              onClick={() => setComboPreview(null)}
              aria-label="Fechar detalhes"
            >
              <X size={18} />
            </button>

            <div className="grid gap-6 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,.95fr)] lg:p-6">
              <ProductGallery images={productImages(comboPreview)} alt={comboPreview.name} />

              <div className="combo-preview-content">
                <div>
                  <p className="text-[11px] font-semibold tracking-[0.16em] text-rose uppercase">
                    {comboPreview.brand} · {comboPreview.category}
                  </p>
                  <h3 className="font-display mt-2 text-3xl font-semibold text-brown-deep">
                    {comboPreview.name}
                  </h3>
                  <p className="mt-3 text-2xl font-semibold text-ink">
                    {formatBRL(comboPreview.effectivePrice)}
                  </p>
                  {(comboPreview.effectiveShippingPrice ?? comboPreview.shippingPrice) != null ? (
                    <p className="mt-1 text-sm font-semibold text-muted">
                      {comboPreview.shippingInherited ? "Frete da marca " : "Frete "}
                      {formatBRL(
                        comboPreview.effectiveShippingPrice ?? comboPreview.shippingPrice ?? 0,
                      )}
                    </p>
                  ) : null}
                </div>

                <dl className="grid gap-3 text-sm">
                  <div className="flex justify-between gap-4 border-b border-line py-2">
                    <dt className="text-muted">Loja</dt>
                    <dd className="text-right">{comboPreview.store}</dd>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-line py-2">
                    <dt className="text-muted">Prioridade</dt>
                    <dd className="text-right">{comboPreview.priority}</dd>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-line py-2">
                    <dt className="text-muted">Status</dt>
                    <dd className="text-right">{comboPreview.status}</dd>
                  </div>
                  {comboPreview.color ? (
                    <div className="flex justify-between gap-4 border-b border-line py-2">
                      <dt className="text-muted">Cor</dt>
                      <dd className="text-right">{comboPreview.color}</dd>
                    </div>
                  ) : null}
                  {comboPreview.size ? (
                    <div className="flex justify-between gap-4 border-b border-line py-2">
                      <dt className="text-muted">Tamanho</dt>
                      <dd className="text-right">{comboPreview.size}</dd>
                    </div>
                  ) : null}
                </dl>

                {comboPreview.notes ? (
                  <div>
                    <p className="text-xs font-semibold tracking-wide text-muted uppercase">Observações</p>
                    <p className="mt-2 text-sm leading-relaxed text-ink">{comboPreview.notes}</p>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-3">
                  {comboPreview.purchaseUrl ? (
                    <a
                      className="btn-primary"
                      href={comboPreview.purchaseUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink size={16} /> Comprar na loja
                    </a>
                  ) : null}
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => {
                      setComboPreview(null);
                      openBuyModal(
                        comboPreview,
                        "plannerSource" in comboPreview && comboPreview.plannerSource === "repurchase",
                      );
                    }}
                  >
                    Registrar compra
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <ProductFormModal
        open={formOpen}
        initial={editing}
        onClose={() => setFormOpen(false)}
        onSave={onSave}
      />

      {buying ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-brown-deep/35 p-4">
          <div className="card-soft w-full max-w-md p-5">
            <h3 className="font-display text-2xl text-brown-deep">Registrar compra</h3>
            <p className="mt-1 text-sm text-muted">{buying.item.name}</p>
            {buying.repurchase ? (
              <p className="mt-1 text-xs font-semibold tracking-[0.08em] text-rose uppercase">
                Esta compra será registrada como recompra e manterá o histórico anterior.
              </p>
            ) : null}
            <div className="mt-4 grid gap-3">
              <label className="field">
                <span>Preço pago</span>
                <input value={paid} onChange={(e) => setPaid(e.target.value)} />
              </label>
              <label className="field">
                <span>Data</span>
                <input type="date" value={buyDate} onChange={(e) => setBuyDate(e.target.value)} />
              </label>
              <label className="field">
                <span>Observação</span>
                <textarea rows={2} value={buyNotes} onChange={(e) => setBuyNotes(e.target.value)} />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setBuying(null)}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={() => void confirmBuy()}>
                Confirmar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="fixed right-4 bottom-4 z-50 rounded-2xl border border-line bg-surface px-4 py-3 text-sm shadow-lg">
          {toast}
        </div>
      ) : null}
        </>
      )}
    </AppShell>
  );
}


