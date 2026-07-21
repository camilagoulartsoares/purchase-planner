import type { NextFunction, Request, Response } from "express";
import { ok } from "../middlewares/errorHandler.js";
import { mercadoLivreService } from "../services/mercadoLivreService.js";
import { env } from "../config/env.js";

function frontendCallbackUrl(result: "success" | "error", message: string) {
  const url = new URL("/?tab=achadinhos", env.frontendUrl);
  url.searchParams.set("meli", result);
  url.searchParams.set("message", message);
  return url.toString();
}

export const mercadoLivreController = {
  async publicConfig(_req: Request, res: Response, next: NextFunction) {
    try {
      return ok(res, mercadoLivreService.getPublicConfig());
    } catch (error) {
      return next(error);
    }
  },

  async status(req: Request, res: Response, next: NextFunction) {
    try {
      return ok(res, await mercadoLivreService.getStatus(req.user!.id));
    } catch (error) {
      return next(error);
    }
  },

  async connect(req: Request, res: Response, next: NextFunction) {
    try {
      const redirectTo =
        typeof req.query.redirectTo === "string" ? req.query.redirectTo : null;
      return ok(res, await mercadoLivreService.createConnectUrl(req.user!.id, redirectTo));
    } catch (error) {
      return next(error);
    }
  },

  async callback(req: Request, res: Response) {
    try {
      const code = String(req.query.code || "");
      const state = String(req.query.state || "");
      if (!code || !state) {
        return res.redirect(frontendCallbackUrl("error", "Callback do Mercado Livre incompleto"));
      }

      const result = await mercadoLivreService.handleCallback(code, state);
      const redirectUrl = new URL(result.redirectTo, env.frontendUrl);
      redirectUrl.searchParams.set("meli", "connected");
      if (result.nickname) redirectUrl.searchParams.set("nickname", result.nickname);
      return res.redirect(redirectUrl.toString());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha na conexao com Mercado Livre";
      return res.redirect(frontendCallbackUrl("error", message));
    }
  },

  async syncFavorites(req: Request, res: Response, next: NextFunction) {
    try {
      return ok(res, await mercadoLivreService.syncFavorites(req.user!.id));
    } catch (error) {
      return next(error);
    }
  },

  async diagnostics(req: Request, res: Response, next: NextFunction) {
    try {
      return ok(res, await mercadoLivreService.runDiagnostics(req.user!.id));
    } catch (error) {
      return next(error);
    }
  },

  async disconnect(req: Request, res: Response, next: NextFunction) {
    try {
      return ok(res, await mercadoLivreService.disconnect(req.user!.id));
    } catch (error) {
      return next(error);
    }
  },
};
