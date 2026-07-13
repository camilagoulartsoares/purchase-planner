import { Router } from "express";
import { productController } from "../controllers/productController.js";
import { authMiddleware } from "../middlewares/auth.js";
import { upload } from "../middlewares/upload.js";

export const productRoutes = Router();

productRoutes.use(authMiddleware);

const imagesUpload = upload.fields([
  { name: "images", maxCount: 12 },
  { name: "image", maxCount: 1 },
]);

function normalizeFiles(
  req: Parameters<typeof productController.create>[0],
  _res: unknown,
  next: () => void,
) {
  const files = req.files as
    | { [field: string]: Express.Multer.File[] }
    | undefined;
  const list: Express.Multer.File[] = [];
  if (files?.images) list.push(...files.images);
  if (files?.image) list.push(...files.image);
  if (list.length) {
    (req as { files: Express.Multer.File[] }).files = list;
    req.file = list[0];
  }
  next();
}

productRoutes.get("/", productController.list);
productRoutes.get("/:id", productController.get);
productRoutes.post("/", imagesUpload, normalizeFiles, productController.create);
productRoutes.put("/:id", imagesUpload, normalizeFiles, productController.update);
productRoutes.patch("/:id/status", productController.patchStatus);
productRoutes.delete("/:id", productController.remove);
