import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { AppError } from "./errorHandler.js";

export type AuthUser = { id: string; email: string };

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(new AppError("Não autenticado", 401));
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, env.jwtSecret) as AuthUser;
    req.user = { id: payload.id, email: payload.email };
    return next();
  } catch {
    return next(new AppError("Token inválido ou expirado", 401));
  }
}
