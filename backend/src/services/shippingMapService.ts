import { prisma } from "../config/prisma.js";
import { AppError } from "../middlewares/errorHandler.js";

const CEP = "37500224";

export const shippingMapService = {
  async list(userId: string) {
    const products = await prisma.product.findMany({
      where: { userId }, include: { brand: true }, orderBy: { createdAt: "desc" },
    });
    const checkedAt = new Date().toISOString();
    const items = products.map((product) => {
      const price = Number(product.promotionalPrice ?? product.originalPrice);
      const shipping = product.shippingPrice == null ? null : Number(product.shippingPrice);
      const discount = product.promotionalPrice != null
        ? Math.max(0, Number(product.originalPrice) - Number(product.promotionalPrice)) : 0;
      return {
        productId: product.id, name: product.name, brand: product.brand.name, store: product.store,
        purchaseUrl: product.purchaseUrl, price, shipping, coupon: null, couponNote: null,
        discount, total: shipping === null ? null : price + shipping - discount,
        deliveryDays: null, cep: CEP, checkedAt,
        shippingStatus: !product.purchaseUrl ? "missing_link" : shipping === null ? "unavailable" : "available",
        shippingMessage: !product.purchaseUrl ? "Adicione o link específico do produto." : shipping === null ? "Frete indisponível para consulta automática" : "Frete informado no produto.",
      };
    }).sort((a, b) => (a.total ?? Number.MAX_SAFE_INTEGER) - (b.total ?? Number.MAX_SAFE_INTEGER));
    return { cep: CEP, checkedAt, items };
  },
  async updateLink(userId: string, productId: string, purchaseUrl: string) {
    try {
      const url = new URL(purchaseUrl);
      if (!/^https?:$/.test(url.protocol)) throw new Error();
    } catch { throw new AppError("Informe um link HTTP ou HTTPS válido.", 400); }
    const product = await prisma.product.findFirst({ where: { id: productId, userId } });
    if (!product) throw new AppError("Produto não encontrado.", 404);
    await prisma.product.update({ where: { id: productId }, data: { purchaseUrl } });
    return { productId, purchaseUrl };
  },
};
