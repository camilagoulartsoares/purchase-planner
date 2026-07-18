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

function logHandledError(
  req: Request,
  err: unknown,
  extra?: Record<string, unknown>,
) {
  console.error("[http.error]", {
    method: req.method,
    path: req.originalUrl,
    ...extra,
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
}

export function ok<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ success: true, data });
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof AppError) {
    logHandledError(req, err, {
      statusCode: err.statusCode,
      details: err.details,
    });

    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      details: err.details,
    });
  }

  if (err instanceof ZodError) {
    const details = err.flatten();
    logHandledError(req, err, {
      statusCode: 400,
      details,
    });

    return res.status(400).json({
      success: false,
      message: "Dados invalidos",
      details,
    });
  }

  logHandledError(req, err, { statusCode: 500 });
  return res.status(500).json({
    success: false,
    message: "Erro interno do servidor",
  });
}
