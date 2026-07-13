import { Router } from "express";
import { productController } from "../controllers/productController.js";
import { authMiddleware } from "../middlewares/auth.js";

export const dashboardRoutes = Router();

dashboardRoutes.use(authMiddleware);
dashboardRoutes.get("/summary", productController.summary);
