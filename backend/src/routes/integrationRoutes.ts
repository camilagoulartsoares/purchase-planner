import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.js";
import { mercadoLivreController } from "../controllers/mercadoLivreController.js";
import { whatsappController } from "../controllers/whatsappController.js";

export const integrationRoutes = Router();

integrationRoutes.get("/mercadolivre/public-config", mercadoLivreController.publicConfig);
integrationRoutes.get("/mercadolivre/callback", mercadoLivreController.callback);

integrationRoutes.use(authMiddleware);
integrationRoutes.get("/mercadolivre/status", mercadoLivreController.status);
integrationRoutes.get("/mercadolivre/connect", mercadoLivreController.connect);
integrationRoutes.get("/mercadolivre/diagnostics", mercadoLivreController.diagnostics);
integrationRoutes.post("/mercadolivre/sync-favorites", mercadoLivreController.syncFavorites);
integrationRoutes.delete("/mercadolivre/disconnect", mercadoLivreController.disconnect);

// Integração pessoal por WhatsApp Web/Evolution API. Não usa a Cloud API da Meta.
integrationRoutes.get("/whatsapp/status", whatsappController.status);
integrationRoutes.post("/whatsapp/instance", whatsappController.createInstance);
integrationRoutes.get("/whatsapp/qr", whatsappController.qrCode);
integrationRoutes.post("/whatsapp/test", whatsappController.test);
