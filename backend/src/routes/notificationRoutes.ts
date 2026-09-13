import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.js";
import { whatsappController } from "../controllers/whatsappController.js";

export const notificationRoutes = Router();

// Alias explícito para testes de notificação. Mantém a rota de integração já
// existente para não quebrar a tela do Purchase Planner.
notificationRoutes.use(authMiddleware);
notificationRoutes.post("/whatsapp/test", whatsappController.test);
