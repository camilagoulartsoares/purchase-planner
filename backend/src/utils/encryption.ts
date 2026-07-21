import crypto from "node:crypto";
import { env } from "../config/env.js";
import { AppError } from "../middlewares/errorHandler.js";

function getKey() {
  const raw = env.mercadoLivre.tokenEncryptionKey.trim();
  if (!raw) {
    throw new AppError("Integração Mercado Livre indisponível: chave de criptografia ausente", 503);
  }

  const normalized = raw.replace(/\s+/g, "");
  const key =
    /^[A-Fa-f0-9]{64}$/.test(normalized)
      ? Buffer.from(normalized, "hex")
      : Buffer.from(normalized, "base64");

  if (key.length !== 32) {
    throw new AppError(
      "Integração Mercado Livre indisponível: MELI_TOKEN_ENCRYPTION_KEY deve ter 32 bytes em hex ou base64",
      503,
    );
  }

  return key;
}

export function encryptSecret(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptSecret(value: string) {
  const [ivPart, tagPart, payloadPart] = value.split(".");
  if (!ivPart || !tagPart || !payloadPart) {
    throw new AppError("Token criptografado inválido", 500);
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivPart, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payloadPart, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export function randomState(size = 32) {
  return crypto.randomBytes(size).toString("hex");
}
