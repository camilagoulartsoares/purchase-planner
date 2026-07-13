import { v2 as cloudinary } from "cloudinary";
import { cloudinaryConfigured, env } from "./env.js";

if (cloudinaryConfigured()) {
  cloudinary.config({
    cloud_name: env.cloudinary.cloudName,
    api_key: env.cloudinary.apiKey,
    api_secret: env.cloudinary.apiSecret,
  });
}

export { cloudinary };
