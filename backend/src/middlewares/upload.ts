import multer from "multer";
import { env } from "../config/env.js";
import { AppError } from "./errorHandler.js";

const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxFileSizeMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!allowed.has(file.mimetype)) {
      return cb(new AppError("Formato inválido. Use JPG, PNG ou WEBP.", 400));
    }
    cb(null, true);
  },
});
