import "dotenv/config";

function withDatabaseTimeouts(rawUrl: string) {
  if (!rawUrl) return rawUrl;

  try {
    const url = new URL(rawUrl);
    const defaults = {
      connection_limit: "3",
      pool_timeout: "10",
      connect_timeout: "10",
    };

    for (const [key, value] of Object.entries(defaults)) {
      if (!url.searchParams.has(key)) {
        url.searchParams.set(key, value);
      }
    }

    return url.toString();
  } catch (error) {
    console.error("[env] DATABASE_URL invalida", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return rawUrl;
  }
}

const databaseUrl = withDatabaseTimeouts(process.env.DATABASE_URL || "");

if (databaseUrl) {
  process.env.DATABASE_URL = databaseUrl;
}

export const env = {
  port: Number(process.env.PORT || 3333),
  nodeEnv: process.env.NODE_ENV || "development",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
  databaseUrl,
  jwtSecret: process.env.JWT_SECRET || "dev-secret",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
    apiKey: process.env.CLOUDINARY_API_KEY || "",
    apiSecret: process.env.CLOUDINARY_API_SECRET || "",
    folder: process.env.CLOUDINARY_FOLDER || "closet-sonhos",
  },
  mercadoLivre: {
    clientId: process.env.MELI_CLIENT_ID || "",
    clientSecret: process.env.MELI_CLIENT_SECRET || "",
    redirectUri: process.env.MELI_REDIRECT_URI || "",
    tokenEncryptionKey: process.env.MELI_TOKEN_ENCRYPTION_KEY || "",
  },
  maxFileSizeMb: Number(process.env.MAX_FILE_SIZE_MB || 5),
};

export function cloudinaryConfigured() {
  return Boolean(
    env.cloudinary.cloudName &&
      env.cloudinary.apiKey &&
      env.cloudinary.apiSecret,
  );
}

export function mercadoLivreConfigured() {
  return Boolean(
    env.mercadoLivre.clientId &&
      env.mercadoLivre.clientSecret &&
      env.mercadoLivre.redirectUri &&
      env.mercadoLivre.tokenEncryptionKey,
  );
}
