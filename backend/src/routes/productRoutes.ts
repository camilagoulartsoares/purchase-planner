import { Router } from "express";
import { productController } from "../controllers/productController.js";
import { authMiddleware } from "../middlewares/auth.js";
import { upload } from "../middlewares/upload.js";

export const productRoutes = Router();

productRoutes.use(authMiddleware);

productRoutes.get("/", productController.list);
productRoutes.get("/:id", productController.get);
productRoutes.post("/", upload.single("image"), productController.create);
productRoutes.put("/:id", upload.single("image"), productController.update);
productRoutes.patch("/:id/status", productController.patchStatus);
productRoutes.delete("/:id", productController.remove);
