import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import {
  productBodySchema,
  productQuerySchema,
  statusSchema,
} from "../schemas/index.js";
import { AppError, ok } from "../middlewares/errorHandler.js";
import { productService } from "../services/productService.js";

function param(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value || "";
}

function parseBody(raw: Record<string, unknown>) {
  const normalized = {
    ...raw,
    promotionalPrice:
      raw.promotionalPrice === "" || raw.promotionalPrice == null
        ? null
        : raw.promotionalPrice,
    purchaseUrl:
      raw.purchaseUrl === "" || raw.purchaseUrl == null
        ? null
        : raw.purchaseUrl,
  };
  return productBodySchema.parse(normalized);
}

function filesFrom(req: Request) {
  const many = req.files as Express.Multer.File[] | undefined;
  return many?.length ? many : undefined;
}

export const productController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const query = productQuerySchema.parse(req.query);
      const data = await productService.list(req.user!.id, {
        ...query,
        page: query.page,
        perPage: query.perPage,
        sort: query.sort,
      });
      return ok(res, data);
    } catch (err) {
      return next(err);
    }
  },

  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await productService.getById(req.user!.id, param(req.params.id));
      return ok(res, data);
    } catch (err) {
      return next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const body = parseBody(req.body);
      const data = await productService.create(
        req.user!.id,
        body,
        req.file,
        filesFrom(req),
      );
      return ok(res, data, 201);
    } catch (err) {
      if (err instanceof ZodError) {
        return next(new AppError("Dados inválidos", 400, err.flatten()));
      }
      return next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const body = parseBody(req.body);
      const data = await productService.update(
        req.user!.id,
        param(req.params.id),
        {
          ...body,
          keepImageIds: req.body.keepImageIds,
          mainImageId: req.body.mainImageId,
          mainNewIndex: req.body.mainNewIndex,
        },
        req.file,
        filesFrom(req),
      );
      return ok(res, data);
    } catch (err) {
      if (err instanceof ZodError) {
        return next(new AppError("Dados inválidos", 400, err.flatten()));
      }
      return next(err);
    }
  },

  async patchStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const body = statusSchema.parse(req.body);
      const data = await productService.updateStatus(
        req.user!.id,
        param(req.params.id),
        body,
      );
      return ok(res, data);
    } catch (err) {
      return next(err);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      await productService.remove(req.user!.id, param(req.params.id));
      return ok(res, { deleted: true });
    } catch (err) {
      return next(err);
    }
  },

  async toggleFavorite(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await productService.toggleFavorite(
        req.user!.id,
        param(req.params.id),
      );
      return ok(res, data);
    } catch (err) {
      return next(err);
    }
  },

  async summary(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await productService.summary(req.user!.id);
      return ok(res, data);
    } catch (err) {
      return next(err);
    }
  },
};
