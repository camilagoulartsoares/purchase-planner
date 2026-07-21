import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.js";
import { mercadoLivreController } from "../controllers/mercadoLivreController.js";

export const integrationRoutes = Router();

integrationRoutes.get("/mercadolivre/public-config", mercadoLivreController.publicConfig);
integrationRoutes.get("/mercadolivre/callback", mercadoLivreController.callback);

integrationRoutes.use(authMiddleware);
integrationRoutes.get("/mercadolivre/status", mercadoLivreController.status);
integrationRoutes.get("/mercadolivre/connect", mercadoLivreController.connect);
integrationRoutes.post("/mercadolivre/sync-favorites", mercadoLivreController.syncFavorites);
integrationRoutes.delete("/mercadolivre/disconnect", mercadoLivreController.disconnect);
