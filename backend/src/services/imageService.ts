import { cloudinary } from "../config/cloudinary.js";
import { cloudinaryConfigured, env } from "../config/env.js";
import { AppError } from "../middlewares/errorHandler.js";

export type UploadedImage = {
  imageUrl: string;
  imagePublicId: string;
};

export const imageService = {
  async upload(file: Express.Multer.File): Promise<UploadedImage> {
    if (!cloudinaryConfigured()) {
      // Dev fallback: data URL not ideal for production; store a placeholder path marker
      // Prefer configuring Cloudinary. For local demo without Cloudinary, use base64 data URI temporary.
      const base64 = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
      return {
        imageUrl: base64,
        imagePublicId: `local/${Date.now()}-${file.originalname}`,
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

  async remove(publicId?: string | null) {
    if (!publicId || publicId.startsWith("local/")) return;
    if (!cloudinaryConfigured()) return;
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (err) {
      console.warn("Falha ao remover imagem do Cloudinary", err);
    }
  },
};
