import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authMiddleware } from "../middlewares/auth.js";
import { shoppingAssistantController } from "../controllers/shoppingAssistantController.js";

export const shoppingAssistantRoutes = Router();
shoppingAssistantRoutes.use(authMiddleware);
shoppingAssistantRoutes.post("/ask", rateLimit({ windowMs: 60_000, max: 18, standardHeaders: true, legacyHeaders: false, message: { success: false, message: "Muitas mensagens. Aguarde um minuto para continuar." } }), shoppingAssistantController.ask);
