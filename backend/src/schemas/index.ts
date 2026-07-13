import { z } from "zod";
import {
  CATEGORIES,
  PRIORITIES,
  STATUSES,
  isHttpUrl,
  toNumber,
} from "../utils/constants.js";

const money = z.preprocess(
  (value) => {
    if (value === "" || value == null) return value;
    const n = toNumber(value);
    return Number.isFinite(n) ? n : value;
  },
  z.number().positive("Informe um valor válido"),
);

const optionalMoney = z.preprocess(
  (value) => {
    if (value === "" || value == null) return null;
    const n = toNumber(value);
    return Number.isFinite(n) ? n : value;
  },
  z.number().positive().optional().nullable(),
);

export const registerSchema = z.object({
  name: z.string().min(2, "Nome muito curto"),
  email: z.string().email("E-mail inválido"),
  password: z.string().min(6, "Senha deve ter ao menos 6 caracteres"),
});

export const loginSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(1, "Informe a senha"),
});

export const productBodySchema = z
  .object({
    name: z.string().min(2),
    category: z.enum(CATEGORIES),
    brand: z.string().min(1),
    store: z.string().min(1),
    originalPrice: money,
    promotionalPrice: optionalMoney,
    purchaseUrl: z
      .string()
      .optional()
      .nullable()
      .refine((v) => !v || isHttpUrl(v), "Link deve começar com http:// ou https://"),
    color: z.string().optional().nullable(),
    size: z.string().optional().nullable(),
    priority: z.enum(PRIORITIES).default("Quero"),
    status: z.enum(STATUSES).default("Quero comprar"),
    notes: z.string().optional().nullable(),
  })
  .refine(
    (data) =>
      data.promotionalPrice == null ||
      data.promotionalPrice <= data.originalPrice,
    {
      message: "Preço promocional não pode ser maior que o original",
      path: ["promotionalPrice"],
    },
  );

export const statusSchema = z.object({
  status: z.enum(STATUSES),
  purchasedPrice: z.coerce.number().positive().optional(),
  purchasedAt: z.string().optional(),
  notes: z.string().optional().nullable(),
});

export const productQuerySchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  brand: z.string().optional(),
  brandSlug: z.string().optional(),
  store: z.string().optional(),
  color: z.string().optional(),
  size: z.string().optional(),
  priority: z.string().optional(),
  status: z.string().optional(),
  promo: z.enum(["com", "sem", ""]).optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  priceBand: z
    .enum([
      "",
      "ate-50",
      "50-100",
      "100-200",
      "200-300",
      "300-500",
      "500-1000",
      "acima-1000",
    ])
    .optional(),
  sort: z
    .enum([
      "menor-preco",
      "maior-preco",
      "maior-desconto",
      "recentes",
      "antigos",
      "nome",
      "marca",
      "prioridade",
    ])
    .optional()
    .default("recentes"),
  page: z.coerce.number().int().positive().optional().default(1),
  perPage: z.coerce.number().int().positive().max(50).optional().default(12),
});
