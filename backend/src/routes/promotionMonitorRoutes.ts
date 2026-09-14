import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.js";
import { promotionMonitorController } from "../controllers/promotionMonitorController.js";

export const promotionMonitorRoutes = Router();
promotionMonitorRoutes.use(authMiddleware);
promotionMonitorRoutes.get("/settings", promotionMonitorController.settings);
promotionMonitorRoutes.put("/settings", promotionMonitorController.saveSettings);
promotionMonitorRoutes.get("/providers", promotionMonitorController.providers);
promotionMonitorRoutes.get("/watch-items", promotionMonitorController.list);
promotionMonitorRoutes.post("/watch-items", promotionMonitorController.create);
promotionMonitorRoutes.post("/watch-items/:id/check", promotionMonitorController.checkNow);
promotionMonitorRoutes.get("/watch-items/:id/offers", promotionMonitorController.offers);
promotionMonitorRoutes.patch("/watch-items/:id", promotionMonitorController.update);
promotionMonitorRoutes.delete("/watch-items/:id", promotionMonitorController.remove);
