import { Injectable } from '@nestjs/common';
import {
  MarketplaceOrderStatus,
  MarketplacePaymentMethod,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  clampDiscountPercent,
  effectiveUnitPriceCents,
} from './marketplace-pricing.util';

export type MarketplaceCheckoutLineSnapshot = {
  productId: string;
  name: string;
  sku: string;
  listUnitPriceCents: number;
  discountPercent: number;
  promoDiscountPercent: number;
  unitPriceCents: number;
  qty: number;
  imageUrl?: string | null;
};

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
        onlinePaymentsEnabled: false,
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

  private async resolveLines(
    tx: Prisma.TransactionClient,
    lines: Array<{ productId: string; qty: number }>,
    opts: { decrementStock: boolean },
  ) {
    let subtotalCents = 0;
    let listSubtotalCents = 0;
    const resolved: Array<{
      productId: string;
      name: string;
      sku: string;
      listUnitPriceCents: number;
      discountPercent: number;
      promoDiscountPercent: number;
      unitPriceCents: number;
      qty: number;
      imageUrl?: string | null;
    }> = [];
    const currencies = new Set<string>();

    for (const line of lines) {
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
      if (opts.decrementStock) {
        await tx.marketplaceProduct.update({
          where: { id: product.id },
          data: { stockQty: { decrement: line.qty } },
        });
      }
      currencies.add(product.currency.toUpperCase());
      const listUnitPriceCents = product.priceCents;
      const discountPercent = clampDiscountPercent(product.discountPercent);
      const promoDiscountPercent = clampDiscountPercent(
        product.promoDiscountPercent,
      );
      const unitPriceCents = effectiveUnitPriceCents({
        priceCents: listUnitPriceCents,
        discountPercent,
        promoDiscountPercent,
      });
      listSubtotalCents += listUnitPriceCents * line.qty;
      subtotalCents += unitPriceCents * line.qty;
      resolved.push({
        productId: product.id,
        name: product.name,
        sku: product.sku,
        listUnitPriceCents,
        discountPercent,
        promoDiscountPercent,
        unitPriceCents,
        qty: line.qty,
        imageUrl: product.images[0]?.url ?? null,
      });
    }

    if (currencies.size > 1) {
      throw new Error('MIXED_CURRENCY');
    }

    return {
      resolved,
      subtotalCents,
      listSubtotalCents,
      orderCurrency: [...currencies][0] ?? 'USD',
    };
  }

  /** Atomic stock decrement + order create inside a transaction (email checkout). */
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
      const { resolved, subtotalCents, listSubtotalCents, orderCurrency } =
        await this.resolveLines(
          tx,
          args.lines.map((l) => ({ productId: l.productId, qty: l.qty })),
          { decrementStock: true },
        );

      return tx.marketplaceOrder.create({
        data: {
          orderNumber: args.orderNumber,
          customerName: args.customerName,
          customerEmail: args.customerEmail,
          customerPhone: args.customerPhone,
          customerAddress: args.customerAddress,
          notes: args.notes,
          subtotalCents,
          listSubtotalCents,
          discountTotalCents: Math.max(0, listSubtotalCents - subtotalCents),
          taxCents: 0,
          totalCents: subtotalCents,
          currency: orderCurrency,
          paymentMethod: MarketplacePaymentMethod.EMAIL,
          status: MarketplaceOrderStatus.PENDING,
          items: {
            create: resolved.map((r) => ({
              productId: r.productId,
              name: r.name,
              sku: r.sku,
              listUnitPriceCents: r.listUnitPriceCents,
              discountPercent: r.discountPercent,
              promoDiscountPercent: r.promoDiscountPercent,
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

  /** Create PayPal intent order without decrementing stock. */
  async createPendingPayPalOrder(args: {
    orderNumber: string;
    customerName: string;
    customerEmail: string;
    customerPhone?: string;
    customerAddress?: string;
    notes?: string;
    currency: string;
    paypalOrderId?: string;
    notifyWhatsapp?: boolean;
    lines: Array<{ productId: string; qty: number }>;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const { resolved, subtotalCents, listSubtotalCents, orderCurrency } =
        await this.resolveLines(tx, args.lines, { decrementStock: false });

      return tx.marketplaceOrder.create({
        data: {
          orderNumber: args.orderNumber,
          customerName: args.customerName,
          customerEmail: args.customerEmail,
          customerPhone: args.customerPhone,
          customerAddress: args.customerAddress,
          notes: args.notes,
          subtotalCents,
          listSubtotalCents,
          discountTotalCents: Math.max(0, listSubtotalCents - subtotalCents),
          taxCents: 0,
          totalCents: subtotalCents,
          currency: orderCurrency,
          paymentMethod: MarketplacePaymentMethod.PAYPAL,
          status: MarketplaceOrderStatus.AWAITING_PAYMENT,
          paypalOrderId: args.paypalOrderId,
          notifyWhatsapp: args.notifyWhatsapp ?? true,
          items: {
            create: resolved.map((r) => ({
              productId: r.productId,
              name: r.name,
              sku: r.sku,
              listUnitPriceCents: r.listUnitPriceCents,
              discountPercent: r.discountPercent,
              promoDiscountPercent: r.promoDiscountPercent,
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

  /** Create EMAIL / BANK_TRANSFER order awaiting payment (stock decremented on confirm). */
  async createAwaitingOfflineOrder(args: {
    orderNumber: string;
    customerName: string;
    customerEmail: string;
    customerPhone?: string;
    customerAddress?: string;
    notes?: string;
    currency: string;
    notifyWhatsapp?: boolean;
    paymentMethod:
      | typeof MarketplacePaymentMethod.EMAIL
      | typeof MarketplacePaymentMethod.BANK_TRANSFER;
    lines: Array<{ productId: string; qty: number }>;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const { resolved, subtotalCents, listSubtotalCents, orderCurrency } =
        await this.resolveLines(tx, args.lines, { decrementStock: false });

      return tx.marketplaceOrder.create({
        data: {
          orderNumber: args.orderNumber,
          customerName: args.customerName,
          customerEmail: args.customerEmail,
          customerPhone: args.customerPhone,
          customerAddress: args.customerAddress,
          notes: args.notes,
          subtotalCents,
          listSubtotalCents,
          discountTotalCents: Math.max(0, listSubtotalCents - subtotalCents),
          taxCents: 0,
          totalCents: subtotalCents,
          currency: orderCurrency,
          paymentMethod: args.paymentMethod,
          status: MarketplaceOrderStatus.AWAITING_PAYMENT,
          notifyWhatsapp: args.notifyWhatsapp ?? true,
          items: {
            create: resolved.map((r) => ({
              productId: r.productId,
              name: r.name,
              sku: r.sku,
              listUnitPriceCents: r.listUnitPriceCents,
              discountPercent: r.discountPercent,
              promoDiscountPercent: r.promoDiscountPercent,
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

  /** Decrement stock for an awaiting PayPal order (idempotent if already past AWAITING). */
  async decrementStockForOrder(orderId: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.marketplaceOrder.findUnique({
        where: { id: orderId },
        include: { items: true },
      });
      if (!order) throw new Error('ORDER_NOT_FOUND');
      if (order.status !== MarketplaceOrderStatus.AWAITING_PAYMENT) {
        return order;
      }

      for (const item of order.items) {
        if (!item.productId) continue;
        const product = await tx.marketplaceProduct.findUnique({
          where: { id: item.productId },
        });
        if (!product || !product.published) {
          throw new Error(`UNAVAILABLE:${item.productId}`);
        }
        if (product.stockQty < item.qty) {
          throw new Error(
            `STOCK:${item.productId}:${product.stockQty}:${product.name}`,
          );
        }
        await tx.marketplaceProduct.update({
          where: { id: product.id },
          data: { stockQty: { decrement: item.qty } },
        });
      }

      return tx.marketplaceOrder.findUnique({
        where: { id: orderId },
        include: { items: true },
      });
    });
  }

  /** Create Payphone CARD intent order without decrementing stock. */
  async createPendingCardOrder(args: {
    orderNumber: string;
    customerName: string;
    customerEmail: string;
    customerPhone?: string;
    customerAddress?: string;
    notes?: string;
    currency: string;
    payphoneClientTxId: string;
    notifyWhatsapp?: boolean;
    /** Returns { taxCents, totalCents } from sale subtotal. */
    computeTax: (subtotalCents: number) => { taxCents: number; totalCents: number };
    lines: Array<{ productId: string; qty: number }>;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const { resolved, subtotalCents, listSubtotalCents, orderCurrency } =
        await this.resolveLines(tx, args.lines, { decrementStock: false });

      const { taxCents, totalCents } = args.computeTax(subtotalCents);

      const order = await tx.marketplaceOrder.create({
        data: {
          orderNumber: args.orderNumber,
          customerName: args.customerName,
          customerEmail: args.customerEmail,
          customerPhone: args.customerPhone,
          customerAddress: args.customerAddress,
          notes: args.notes,
          subtotalCents,
          listSubtotalCents,
          discountTotalCents: Math.max(0, listSubtotalCents - subtotalCents),
          taxCents,
          totalCents,
          currency: orderCurrency,
          paymentMethod: MarketplacePaymentMethod.CARD,
          status: MarketplaceOrderStatus.AWAITING_PAYMENT,
          payphoneClientTxId: args.payphoneClientTxId,
          notifyWhatsapp: args.notifyWhatsapp ?? true,
          items: {
            create: resolved.map((r) => ({
              productId: r.productId,
              name: r.name,
              sku: r.sku,
              listUnitPriceCents: r.listUnitPriceCents,
              discountPercent: r.discountPercent,
              promoDiscountPercent: r.promoDiscountPercent,
              unitPriceCents: r.unitPriceCents,
              qty: r.qty,
              imageUrl: r.imageUrl,
            })),
          },
        },
        include: { items: true },
      });

      await tx.marketplacePayment.create({
        data: {
          orderId: order.id,
          clientTransactionId: args.payphoneClientTxId,
          status: 'INITIATED',
          amountCents: totalCents,
          taxCents,
          currency: orderCurrency,
        },
      });

      return order;
    });
  }

  findOrderByPayphoneClientTxId(clientTransactionId: string) {
    return this.prisma.marketplaceOrder.findUnique({
      where: { payphoneClientTxId: clientTransactionId },
      include: { items: true, payments: true },
    });
  }

  /** New Payphone attempt on same unpaid CARD order (new clientTransactionId). */
  async prepareCardPaymentRetry(args: {
    orderId: string;
    payphoneClientTxId: string;
    taxCents: number;
    totalCents: number;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.marketplaceOrder.findUnique({
        where: { id: args.orderId },
      });
      if (!order) throw new Error('ORDER_NOT_FOUND');

      await tx.marketplacePayment.updateMany({
        where: { orderId: args.orderId, status: 'INITIATED' },
        data: { status: 'FAILED' },
      });

      await tx.marketplaceOrder.update({
        where: { id: args.orderId },
        data: {
          status: MarketplaceOrderStatus.AWAITING_PAYMENT,
          paymentError: null,
          payphoneClientTxId: args.payphoneClientTxId,
          taxCents: args.taxCents,
          totalCents: args.totalCents,
        },
      });

      await tx.marketplacePayment.create({
        data: {
          orderId: args.orderId,
          clientTransactionId: args.payphoneClientTxId,
          status: 'INITIATED',
          amountCents: args.totalCents,
          taxCents: args.taxCents,
          currency: order.currency,
        },
      });

      return tx.marketplaceOrder.findUnique({
        where: { id: args.orderId },
        include: { items: true },
      });
    });
  }

  findPaymentByClientTxId(clientTransactionId: string) {
    return this.prisma.marketplacePayment.findUnique({
      where: { clientTransactionId },
      include: { order: { include: { items: true } } },
    });
  }

  updatePayment(
    id: string,
    data: Prisma.MarketplacePaymentUpdateInput,
  ) {
    return this.prisma.marketplacePayment.update({
      where: { id },
      data,
    });
  }

  findOrderByPaypalOrderId(paypalOrderId: string) {
    return this.prisma.marketplaceOrder.findUnique({
      where: { paypalOrderId },
      include: { items: true },
    });
  }

  /** Soft-cancel order (keeps row + line items for admin history). */
  async cancelOrderSoft(
    orderId: string,
    opts?: { paymentError?: string | null },
  ) {
    const data: Prisma.MarketplaceOrderUpdateInput = {
      status: MarketplaceOrderStatus.CANCELLED,
    };
    if (opts && 'paymentError' in opts) {
      data.paymentError = opts.paymentError;
    }
    return this.prisma.marketplaceOrder.update({
      where: { id: orderId },
      data,
      include: { items: true },
    });
  }

  /** @deprecated Use cancelOrderSoft */
  async cancelAwaitingPayment(orderId: string) {
    return this.cancelOrderSoft(orderId);
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

  findLatestConfirmedPayment(orderId: string) {
    return this.prisma.marketplacePayment.findFirst({
      where: { orderId, status: 'CONFIRMED' },
      orderBy: { confirmedAt: 'desc' },
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

  async createOnlineCheckoutSession(args: {
    paymentMethod: MarketplacePaymentMethod;
    plannedOrderNumber: string;
    clientTransactionId?: string;
    customerName: string;
    customerEmail: string;
    customerPhone?: string;
    customerAddress?: string;
    notes?: string;
    notifyWhatsapp?: boolean;
    taxCents?: number;
    totalCents?: number;
    computeTax?: (subtotalCents: number) => {
      taxCents: number;
      totalCents: number;
    };
    lines: Array<{ productId: string; qty: number }>;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const { resolved, subtotalCents, listSubtotalCents, orderCurrency } =
        await this.resolveLines(tx, args.lines, { decrementStock: false });

      const computed = args.computeTax?.(subtotalCents);
      const taxCents = computed?.taxCents ?? args.taxCents ?? 0;
      const totalCents = computed?.totalCents ?? args.totalCents ?? subtotalCents;

      return tx.marketplaceOnlineCheckoutSession.create({
        data: {
          paymentMethod: args.paymentMethod,
          plannedOrderNumber: args.plannedOrderNumber,
          clientTransactionId: args.clientTransactionId,
          customerName: args.customerName,
          customerEmail: args.customerEmail,
          customerPhone: args.customerPhone,
          customerAddress: args.customerAddress,
          notes: args.notes,
          notifyWhatsapp: args.notifyWhatsapp ?? true,
          currency: orderCurrency,
          subtotalCents,
          listSubtotalCents,
          discountTotalCents: Math.max(0, listSubtotalCents - subtotalCents),
          taxCents,
          totalCents,
          lines: resolved as unknown as Prisma.InputJsonValue,
        },
      });
    });
  }

  findOnlineCheckoutSessionByPlannedOrderNumber(plannedOrderNumber: string) {
    return this.prisma.marketplaceOnlineCheckoutSession.findUnique({
      where: { plannedOrderNumber },
    });
  }

  findOnlineCheckoutSessionByClientTxId(clientTransactionId: string) {
    return this.prisma.marketplaceOnlineCheckoutSession.findUnique({
      where: { clientTransactionId },
    });
  }

  findOnlineCheckoutSessionByPaypalOrderId(paypalOrderId: string) {
    return this.prisma.marketplaceOnlineCheckoutSession.findUnique({
      where: { paypalOrderId },
    });
  }

  updateOnlineCheckoutSessionPaypalOrderId(id: string, paypalOrderId: string) {
    return this.prisma.marketplaceOnlineCheckoutSession.update({
      where: { id },
      data: { paypalOrderId },
    });
  }

  deleteOnlineCheckoutSession(id: string) {
    return this.prisma.marketplaceOnlineCheckoutSession.delete({
      where: { id },
    });
  }

  deleteOnlineCheckoutSessionByClientTxId(clientTransactionId: string) {
    return this.prisma.marketplaceOnlineCheckoutSession.deleteMany({
      where: { clientTransactionId },
    });
  }

  async finalizeOnlineCheckoutSession(args: {
    sessionId: string;
    payphoneClientTxId?: string;
    paypalCaptureId?: string;
    cardPayment?: {
      payphoneId: number;
      authorizationCode?: string | null;
      transactionId?: string | null;
      rawResponse: Prisma.InputJsonValue;
      amountCents: number;
      taxCents: number;
    };
  }) {
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.marketplaceOnlineCheckoutSession.findUnique({
        where: { id: args.sessionId },
      });
      if (!session) throw new Error('CHECKOUT_SESSION_NOT_FOUND');

      const lines = session.lines as unknown as MarketplaceCheckoutLineSnapshot[];

      for (const line of lines) {
        const product = await tx.marketplaceProduct.findUnique({
          where: { id: line.productId },
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
          where: { id: line.productId },
          data: { stockQty: { decrement: line.qty } },
        });
      }

      const order = await tx.marketplaceOrder.create({
        data: {
          orderNumber: session.plannedOrderNumber,
          customerName: session.customerName,
          customerEmail: session.customerEmail,
          customerPhone: session.customerPhone,
          customerAddress: session.customerAddress,
          notes: session.notes,
          subtotalCents: session.subtotalCents,
          listSubtotalCents: session.listSubtotalCents,
          discountTotalCents: session.discountTotalCents,
          taxCents: session.taxCents,
          totalCents: session.totalCents,
          currency: session.currency,
          paymentMethod: session.paymentMethod,
          status: MarketplaceOrderStatus.PAID,
          paidAt: new Date(),
          notifyWhatsapp: session.notifyWhatsapp,
          payphoneClientTxId: args.payphoneClientTxId ?? null,
          paypalOrderId: session.paypalOrderId,
          paypalCaptureId: args.paypalCaptureId ?? null,
          paymentError: null,
          items: {
            create: lines.map((line) => ({
              productId: line.productId,
              name: line.name,
              sku: line.sku,
              listUnitPriceCents: line.listUnitPriceCents,
              discountPercent: line.discountPercent,
              promoDiscountPercent: line.promoDiscountPercent,
              unitPriceCents: line.unitPriceCents,
              qty: line.qty,
              imageUrl: line.imageUrl,
            })),
          },
        },
        include: { items: true },
      });

      if (args.cardPayment && args.payphoneClientTxId) {
        await tx.marketplacePayment.create({
          data: {
            orderId: order.id,
            clientTransactionId: args.payphoneClientTxId,
            status: 'CONFIRMED',
            payphoneId: args.cardPayment.payphoneId,
            authorizationCode: args.cardPayment.authorizationCode ?? null,
            transactionId: args.cardPayment.transactionId,
            rawResponse: args.cardPayment.rawResponse,
            amountCents: args.cardPayment.amountCents,
            taxCents: args.cardPayment.taxCents,
            currency: session.currency,
            confirmedAt: new Date(),
          },
        });
      }

      await tx.marketplaceOnlineCheckoutSession.delete({
        where: { id: session.id },
      });

      return order;
    });
  }
}
