import { Router } from "express";
import { brandController } from "../controllers/brandController.js";
import { authMiddleware } from "../middlewares/auth.js";
import { upload } from "../middlewares/upload.js";

export const brandRoutes = Router();

brandRoutes.use(authMiddleware);
brandRoutes.get("/", brandController.list);
brandRoutes.post("/", upload.single("logo"), brandController.create);
brandRoutes.get("/:slug", brandController.get);
