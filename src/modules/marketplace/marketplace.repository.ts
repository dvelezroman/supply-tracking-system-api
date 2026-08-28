import { Injectable } from '@nestjs/common';
import { MarketplaceOrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const productInclude = {
  images: { orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }] },
  traceProduct: { select: { id: true, sku: true, name: true } },
} satisfies Prisma.MarketplaceProductInclude;

@Injectable()
export class MarketplaceRepository {
  constructor(private readonly prisma: PrismaService) {}

  createProduct(data: Prisma.MarketplaceProductCreateInput) {
    return this.prisma.marketplaceProduct.create({
      data,
      include: productInclude,
    });
  }

  findProductById(id: string) {
    return this.prisma.marketplaceProduct.findUnique({
      where: { id },
      include: productInclude,
    });
  }

  findProductBySlug(slug: string) {
    return this.prisma.marketplaceProduct.findUnique({
      where: { slug },
      include: productInclude,
    });
  }

  findProductBySku(sku: string) {
    return this.prisma.marketplaceProduct.findUnique({ where: { sku } });
  }

  findProducts(params: {
    skip?: number;
    take?: number;
    where?: Prisma.MarketplaceProductWhereInput;
  }) {
    return this.prisma.marketplaceProduct.findMany({
      ...params,
      orderBy: { createdAt: 'desc' },
      include: productInclude,
    });
  }

  countProducts(where?: Prisma.MarketplaceProductWhereInput) {
    return this.prisma.marketplaceProduct.count({ where });
  }

  updateProduct(id: string, data: Prisma.MarketplaceProductUpdateInput) {
    return this.prisma.marketplaceProduct.update({
      where: { id },
      data,
      include: productInclude,
    });
  }

  deleteProduct(id: string) {
    return this.prisma.marketplaceProduct.delete({ where: { id } });
  }

  createImage(data: Prisma.MarketplaceProductImageCreateInput) {
    return this.prisma.marketplaceProductImage.create({ data });
  }

  findImageById(id: string) {
    return this.prisma.marketplaceProductImage.findUnique({ where: { id } });
  }

  deleteImage(id: string) {
    return this.prisma.marketplaceProductImage.delete({ where: { id } });
  }

  clearPrimaryImages(productId: string) {
    return this.prisma.marketplaceProductImage.updateMany({
      where: { productId },
      data: { isPrimary: false },
    });
  }

  setPrimaryImage(id: string) {
    return this.prisma.marketplaceProductImage.update({
      where: { id },
      data: { isPrimary: true },
    });
  }

  getSettings() {
    return this.prisma.marketplaceSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default', storeEnabled: true },
      update: {},
    });
  }

  updateSettings(data: Prisma.MarketplaceSettingsUpdateInput) {
    return this.prisma.marketplaceSettings.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        storeEnabled: true,
        orderNotificationEmail:
          typeof data.orderNotificationEmail === 'string'
            ? data.orderNotificationEmail
            : undefined,
        fromName: typeof data.fromName === 'string' ? data.fromName : undefined,
      },
      update: data,
    });
  }

  createOrder(args: {
    order: Prisma.MarketplaceOrderCreateInput;
  }) {
    return this.prisma.marketplaceOrder.create({
      data: args.order,
      include: { items: true },
    });
  }

  /** Atomic stock decrement + order create inside a transaction. */
  async placeOrder(args: {
    orderNumber: string;
    customerName: string;
    customerEmail: string;
    customerPhone?: string;
    customerAddress?: string;
    notes?: string;
    currency: string;
    lines: Array<{
      productId: string;
      name: string;
      sku: string;
      unitPriceCents: number;
      qty: number;
      imageUrl?: string | null;
    }>;
  }) {
    return this.prisma.$transaction(async (tx) => {
      let subtotalCents = 0;
      const resolved: typeof args.lines = [];

      for (const line of args.lines) {
        const product = await tx.marketplaceProduct.findUnique({
          where: { id: line.productId },
          include: {
            images: {
              orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
              take: 1,
            },
          },
        });
        if (!product || !product.published) {
          throw new Error(`UNAVAILABLE:${line.productId}`);
        }
        if (product.stockQty < line.qty) {
          throw new Error(
            `STOCK:${line.productId}:${product.stockQty}:${product.name}`,
          );
        }
        await tx.marketplaceProduct.update({
          where: { id: product.id },
          data: { stockQty: { decrement: line.qty } },
        });
        const unitPriceCents = product.priceCents;
        subtotalCents += unitPriceCents * line.qty;
        resolved.push({
          productId: product.id,
          name: product.name,
          sku: product.sku,
          unitPriceCents,
          qty: line.qty,
          imageUrl: product.images[0]?.url ?? null,
        });
      }

      return tx.marketplaceOrder.create({
        data: {
          orderNumber: args.orderNumber,
          customerName: args.customerName,
          customerEmail: args.customerEmail,
          customerPhone: args.customerPhone,
          customerAddress: args.customerAddress,
          notes: args.notes,
          subtotalCents,
          currency: args.currency,
          status: MarketplaceOrderStatus.PENDING,
          items: {
            create: resolved.map((r) => ({
              productId: r.productId,
              name: r.name,
              sku: r.sku,
              unitPriceCents: r.unitPriceCents,
              qty: r.qty,
              imageUrl: r.imageUrl,
            })),
          },
        },
        include: { items: true },
      });
    });
  }

  findOrderById(id: string) {
    return this.prisma.marketplaceOrder.findUnique({
      where: { id },
      include: { items: true },
    });
  }

  findOrderByNumber(orderNumber: string) {
    return this.prisma.marketplaceOrder.findUnique({
      where: { orderNumber },
      include: { items: true },
    });
  }

  findOrders(params: {
    skip?: number;
    take?: number;
    where?: Prisma.MarketplaceOrderWhereInput;
  }) {
    return this.prisma.marketplaceOrder.findMany({
      ...params,
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    });
  }

  countOrders(where?: Prisma.MarketplaceOrderWhereInput) {
    return this.prisma.marketplaceOrder.count({ where });
  }

  updateOrder(id: string, data: Prisma.MarketplaceOrderUpdateInput) {
    return this.prisma.marketplaceOrder.update({
      where: { id },
      data,
      include: { items: true },
    });
  }

  async restockOrderItems(orderId: string) {
    const order = await this.prisma.marketplaceOrder.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) return null;

    await this.prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        if (!item.productId) continue;
        await tx.marketplaceProduct.update({
          where: { id: item.productId },
          data: { stockQty: { increment: item.qty } },
        });
      }
      await tx.marketplaceOrder.update({
        where: { id: orderId },
        data: { status: MarketplaceOrderStatus.CANCELLED },
      });
    });

    return this.findOrderById(orderId);
  }
}
