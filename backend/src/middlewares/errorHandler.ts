import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export class AppError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(message: string, statusCode = 400, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function ok<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ success: true, data });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      details: err.details,
    });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: "Dados inválidos",
      details: err.flatten(),
    });
  }

  console.error(err);
  return res.status(500).json({
    success: false,
    message: "Erro interno do servidor",
  });
}
