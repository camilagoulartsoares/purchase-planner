import { Router } from "express";
import { findingController } from "../controllers/findingController.js";
import { authMiddleware } from "../middlewares/auth.js";

export const findingRoutes = Router();
findingRoutes.use(authMiddleware);
findingRoutes.post("/preview", findingController.preview);
findingRoutes.get("/", findingController.list);
findingRoutes.post("/", findingController.create);
findingRoutes.put("/:id", findingController.update);
findingRoutes.delete("/:id", findingController.remove);
