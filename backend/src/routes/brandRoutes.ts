import { Router } from "express";
import { brandController } from "../controllers/brandController.js";
import { authMiddleware } from "../middlewares/auth.js";

export const brandRoutes = Router();

brandRoutes.use(authMiddleware);
brandRoutes.get("/", brandController.list);
brandRoutes.get("/:slug", brandController.get);
