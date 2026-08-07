import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authMiddleware } from "../middlewares/auth.js";
import { personalShopperController } from "../controllers/personalShopperController.js";

export const personalShopperRoutes = Router();
personalShopperRoutes.use(authMiddleware);
personalShopperRoutes.use(rateLimit({ windowMs: 60_000, max: 12, standardHeaders: true, legacyHeaders: false, message: { success: false, message: "Muitas buscas. Aguarde um minuto para continuar." } }));
personalShopperRoutes.get("/conversations", personalShopperController.list);
personalShopperRoutes.get("/conversations/:id", personalShopperController.get);
personalShopperRoutes.post("/messages", personalShopperController.message);
personalShopperRoutes.post("/conversations/:id/actions", personalShopperController.action);
