import { env, evolutionConfigured } from "../config/env.js";
import { AppError } from "../middlewares/errorHandler.js";

type EvolutionResponse = Record<string, unknown>;

function digits(value: string) {
  return value.replace(/\D/g, "");
}

function configuredOrThrow() {
  if (!evolutionConfigured()) {
    throw new AppError(
      "WhatsApp ainda não foi configurado. Preencha as variáveis EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE_NAME e EVOLUTION_RECIPIENT.",
      503,
    );
  }
}

async function request<T extends EvolutionResponse>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  configuredOrThrow();
  const response = await fetch(`${env.evolution.apiUrl}${path}`, {
    ...init,
    headers: {
      apikey: env.evolution.apiKey,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
    signal: AbortSignal.timeout(20_000),
  });

  const raw = await response.text();
  let payload: T = {} as T;
  try {
    payload = raw ? (JSON.parse(raw) as T) : ({} as T);
  } catch {
    // A Evolution pode retornar HTML em falhas de proxy; não expomos esse conteúdo.
  }

  if (!response.ok) {
    const detail = typeof payload.message === "string" ? payload.message : "sem detalhe disponível";
    throw new AppError(
      `Evolution API respondeu ${response.status}: ${detail}`,
      response.status >= 500 ? 502 : 400,
    );
  }
  return payload;
}

function extractConnectionState(payload: EvolutionResponse) {
  const candidate =
    payload.instance && typeof payload.instance === "object"
      ? (payload.instance as EvolutionResponse)
      : undefined;
  return String(
    candidate?.state ||
      payload.state ||
      payload.connectionStatus ||
      candidate?.state ||
      "unknown",
  ).toLowerCase();
}

export type PromotionMessage = {
  productName: string;
  currentPrice: number;
  targetPrice?: number | null;
  purchaseUrl: string;
};

function brl(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function formatPromotionMessage(promotion: PromotionMessage) {
  return [
    "🚨 PROMOÇÃO ENCONTRADA",
    "",
    `Produto: ${promotion.productName}`,
    `Preço atual: ${brl(promotion.currentPrice)}`,
    promotion.targetPrice != null ? `Meu preço-alvo: ${brl(promotion.targetPrice)}` : null,
    "",
    promotion.targetPrice != null && promotion.currentPrice <= promotion.targetPrice
      ? "✅ Está dentro do valor que eu quero pagar."
      : "✅ Houve uma nova promoção no produto acompanhado.",
    "",
    `🔗 ${promotion.purchaseUrl}`,
  ].filter(Boolean).join("\n");
}

async function sendText(text: string) {
  const number = digits(env.evolution.recipient);
  if (number.length < 10 || number.length > 15) {
    throw new AppError("EVOLUTION_RECIPIENT deve conter DDI e DDD, apenas números (ex.: 5535999999999).", 400);
  }

  // Endpoint compatível com Evolution API v2. A instância é sempre enviada pela URL,
  // mantendo a chave e o destinatário exclusivamente no servidor.
  return request(`/message/sendText/${encodeURIComponent(env.evolution.instanceName)}`, {
    method: "POST",
    body: JSON.stringify({ number, text, linkPreview: true }),
  });
}

export const evolutionApiService = {
  isConfigured() {
    return evolutionConfigured();
  },

  async status() {
    if (!evolutionConfigured()) {
      return { configured: false, connected: false, state: "not_configured" };
    }

    try {
      const data = await request(`/instance/connectionState/${encodeURIComponent(env.evolution.instanceName)}`);
      const state = extractConnectionState(data);
      return { configured: true, connected: state === "open", state };
    } catch (error) {
      console.warn("[whatsapp.evolution] não foi possível consultar a conexão", {
        instance: env.evolution.instanceName,
        message: error instanceof Error ? error.message : String(error),
      });
      return { configured: true, connected: false, state: "unavailable" };
    }
  },

  async createInstance() {
    configuredOrThrow();
    try {
      await request("/instance/create", {
        method: "POST",
        body: JSON.stringify({
          instanceName: env.evolution.instanceName,
          integration: "WHATSAPP-BAILEYS",
          qrcode: true,
        }),
      });
      console.info("[whatsapp.evolution] instância criada", { instance: env.evolution.instanceName });
    } catch (error) {
      // Se a instância já existe, o QR abaixo ainda é a ação correta. Não falhamos
      // por esse motivo, mas mantemos outros erros visíveis.
      if (!(error instanceof AppError) || !/already|exist|já existe/i.test(error.message)) throw error;
    }
    return this.qrCode();
  },

  async qrCode() {
    const data = await request(`/instance/connect/${encodeURIComponent(env.evolution.instanceName)}`);
    const base64 = typeof data.base64 === "string" ? data.base64 : null;
    const code = typeof data.code === "string" ? data.code : null;
    const pairingCode = typeof data.pairingCode === "string" ? data.pairingCode : null;
    if (!base64 && !code && !pairingCode) {
      throw new AppError("A Evolution API não retornou QR Code. Verifique se a instância está criada e desconectada.", 502);
    }
    return { base64, code, pairingCode };
  },

  async sendPromotion(promotion: PromotionMessage) {
    const text = formatPromotionMessage(promotion);
    try {
      const result = await sendText(text);
      console.info("[whatsapp.evolution] alerta de promoção enviado", {
        instance: env.evolution.instanceName,
        productName: promotion.productName,
      });
      return result;
    } catch (error) {
      console.error("[whatsapp.evolution] alerta não enviado; será exibido nos logs", {
        instance: env.evolution.instanceName,
        productName: promotion.productName,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },

  async sendTest(text?: string) {
    const content = text?.trim() || "✅ Purchase Planner conectado. Este é um teste pessoal de notificações.";
    try {
      const result = await sendText(content);
      console.info("[whatsapp.evolution] mensagem de teste enviada", {
        instance: env.evolution.instanceName,
      });
      return result;
    } catch (error) {
      console.error("[whatsapp.evolution] mensagem de teste não enviada", {
        instance: env.evolution.instanceName,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },
};
