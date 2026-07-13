import "dotenv/config";

export const env = {
  port: Number(process.env.PORT || 3333),
  nodeEnv: process.env.NODE_ENV || "development",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
  databaseUrl: process.env.DATABASE_URL || "",
  jwtSecret: process.env.JWT_SECRET || "dev-secret",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
    apiKey: process.env.CLOUDINARY_API_KEY || "",
    apiSecret: process.env.CLOUDINARY_API_SECRET || "",
    folder: process.env.CLOUDINARY_FOLDER || "closet-sonhos",
  },
  maxFileSizeMb: Number(process.env.MAX_FILE_SIZE_MB || 5),
};

export function cloudinaryConfigured() {
  return Boolean(
    env.cloudinary.cloudName &&
      env.cloudinary.apiKey &&
      env.cloudinary.apiSecret,
  );
}
