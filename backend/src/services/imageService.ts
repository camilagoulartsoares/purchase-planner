import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudinary } from "../config/cloudinary.js";
import { cloudinaryConfigured, env } from "../config/env.js";
import { AppError } from "../middlewares/errorHandler.js";

export type UploadedImage = {
  imageUrl: string;
  imagePublicId: string;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const uploadsDir = path.resolve(__dirname, "../../uploads");

function ensureUploadsDir() {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
}

export const imageService = {
  async upload(file: Express.Multer.File): Promise<UploadedImage> {
    if (!cloudinaryConfigured()) {
      ensureUploadsDir();
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filename = `${Date.now()}-${safe}`;
      const fullPath = path.join(uploadsDir, filename);
      fs.writeFileSync(fullPath, file.buffer);
      return {
        imageUrl: `/uploads/${filename}`,
        imagePublicId: `local/${filename}`,
      };
    }

    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: env.cloudinary.folder,
          resource_type: "image",
        },
        (err, result) => {
          if (err || !result) {
            return reject(new AppError("Falha ao enviar imagem", 500));
          }
          resolve({
            imageUrl: result.secure_url,
            imagePublicId: result.public_id,
          });
        },
      );
      stream.end(file.buffer);
    });
  },

  async uploadMany(files: Express.Multer.File[]): Promise<UploadedImage[]> {
    const out: UploadedImage[] = [];
    for (const file of files) {
      out.push(await this.upload(file));
    }
    return out;
  },

  async remove(publicId?: string | null) {
    if (!publicId) return;
    if (publicId.startsWith("local/")) {
      const filename = publicId.slice("local/".length);
      const fullPath = path.join(uploadsDir, filename);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
      return;
    }
    if (!cloudinaryConfigured()) return;
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (err) {
      console.warn("Falha ao remover imagem do Cloudinary", err);
    }
  },
};
