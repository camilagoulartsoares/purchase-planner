import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./config/prisma.js";
import { backupService } from "./services/backupService.js";
import { mercadoLivreService } from "./services/mercadoLivreService.js";

process.on("unhandledRejection", (reason) => {
  console.error("[startup] unhandledRejection", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[startup] uncaughtException", error);
  process.exit(1);
});

async function bootstrap() {
  backupService.ensureDataDirs();

  console.info("[startup] iniciando bootstrap da API");
  console.info("[startup] conectando ao Prisma");
  await prisma.$connect();
  console.info("[startup] Prisma conectado com sucesso");

  const app = createApp();

  setInterval(() => {
    void mercadoLivreService.runAutoSyncCycle();
  }, mercadoLivreService.autoSyncIntervalMs).unref();

  app.listen(env.port, () => {
    console.log(`API rodando em http://localhost:${env.port}`);
    console.log(`Dados persistentes em: backend/data`);
    console.log(
      `Fotos: ${
        env.cloudinary.cloudName ? "Cloudinary (nuvem)" : "disco local (data/uploads)"
      }`,
    );
  });
}

bootstrap().catch((error) => {
  console.error("[startup] falha ao iniciar a API", {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});
