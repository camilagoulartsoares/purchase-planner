import { Router } from "express";
import { productController } from "../controllers/productController.js";
import { authMiddleware } from "../middlewares/auth.js";
import { shippingMapController } from "../controllers/shippingMapController.js";

export const dashboardRoutes = Router();

dashboardRoutes.use(authMiddleware);
dashboardRoutes.get("/summary", productController.summary);
dashboardRoutes.get("/promo-radar", productController.promoRadar);
dashboardRoutes.get("/promo-media", productController.externalPromotionMedia);
dashboardRoutes.get("/shipping-map", shippingMapController.list);
dashboardRoutes.post("/shipping-map/:id/link", shippingMapController.updateLink);
