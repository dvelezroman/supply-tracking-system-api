import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MarketplaceOrderStatus,
  MarketplacePaymentMethod,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { PaypalService } from '../paypal/paypal.service';
import { PaypalWebhookService } from '../paypal/paypal-webhook.service';
import {
  assertProductImageSize,
  PRODUCT_IMAGE_MAX_COUNT,
  sniffProductImageMime,
} from '../storage/marketplace-product-images.util';
import {
  DEFAULT_MARKETPLACE_KEY_PREFIX,
  parseAwsS3ObjectKeyFromUrl,
  productImageObjectKey,
  readS3StorageConfig,
} from '../storage/s3-storage.util';
import { StorageService } from '../storage/storage.service';
import {
  CapturePayPalOrderDto,
  ConfirmPayphonePaymentDto,
  CreateMarketplaceOrderDto,
  OrderPaymentMethodDto,
} from './dto/create-order.dto';
import {
  CreateMarketplaceProductDto,
  UpdateMarketplaceProductDto,
  UpdateMarketplaceSettingsDto,
} from './dto/marketplace.dto';
import { clampDiscountPercent } from './marketplace-pricing.util';
import { MarketplaceRepository } from './marketplace.repository';
import { WhatsappNotificationsService } from '../whatsapp/whatsapp-notifications.service';
import { PayphoneService } from '../payphone/payphone.service';
import { truncateClientTxId } from '../payphone/payphone-amounts.util';
import { normalizePhoneE164 } from '../../common/phone.util';

@Injectable()
export class MarketplaceService implements OnModuleInit {
  private readonly logger = new Logger(MarketplaceService.name);

  constructor(
    private readonly repo: MarketplaceRepository,
    private readonly storage: StorageService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly paypal: PaypalService,
    private readonly paypalWebhooks: PaypalWebhookService,
    private readonly payphone: PayphoneService,
    private readonly whatsapp: WhatsappNotificationsService,
  ) {}

  onModuleInit(): void {
    this.paypalWebhooks.setHandler(async ({ eventType, paypalOrderId }) => {
      if (
        !paypalOrderId ||
        (eventType !== 'PAYMENT.CAPTURE.COMPLETED' &&
          eventType !== 'CHECKOUT.ORDER.APPROVED')
      ) {
        return;
      }
      const order = await this.repo.findOrderByPaypalOrderId(paypalOrderId);
      if (!order || order.status !== MarketplaceOrderStatus.AWAITING_PAYMENT) {
        return;
      }
      try {
        await this.capturePayPalOrder(order.orderNumber, {
          paypalOrderId,
        });
      } catch (err) {
        this.logger.error(
          `Webhook capture failed for ${order.orderNumber}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    });
  }
  // ─── Products ─────────────────────────────────────────────────────────────

  async createProduct(dto: CreateMarketplaceProductDto) {
    const sku = dto.sku.trim();
    const existing = await this.repo.findProductBySku(sku);
    if (existing) throw new ConflictException(`SKU '${sku}' already exists`);

    const slug = await this.ensureUniqueSlug(
      (dto.slug?.trim() || this.slugify(dto.name)).toLowerCase(),
    );

    if (dto.traceProductId) {
      await this.assertTraceProduct(dto.traceProductId);
    }

    return this.repo.createProduct({
      sku,
      slug,
      name: dto.name.trim(),
      description: dto.description?.trim(),
      category: dto.category?.trim(),
      priceCents: dto.priceCents,
      discountPercent: clampDiscountPercent(dto.discountPercent),
      promoDiscountPercent: clampDiscountPercent(dto.promoDiscountPercent),
      currency: (dto.currency ?? 'USD').toUpperCase(),
      stockQty: dto.stockQty ?? 0,
      published: dto.published ?? false,
      ...(dto.traceProductId
        ? { traceProduct: { connect: { id: dto.traceProductId } } }
        : {}),
    });
  }

  async findProductById(id: string) {
    const product = await this.repo.findProductById(id);
    if (!product) throw new NotFoundException('Marketplace product not found');
    return product;
  }

  async findPublishedBySlug(slug: string) {
    const product = await this.repo.findProductBySlug(slug);
    if (!product || !product.published) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  async listAdmin(page?: number, limit?: number, search?: string, published?: boolean, category?: string) {
    const p = Math.max(1, Number(page) || 1);
    const l = Math.min(100, Math.max(1, Number(limit) || 20));
    const where = this.buildProductWhere({ search, published, category });
    const [items, total] = await Promise.all([
      this.repo.findProducts({ skip: (p - 1) * l, take: l, where }),
      this.repo.countProducts(where),
    ]);
    return { items, total, page: p, limit: l };
  }

  async listPublic(page?: number, limit?: number, search?: string, category?: string) {
    const settings = await this.repo.getSettings();
    if (!settings.storeEnabled) {
      return { items: [], total: 0, page: 1, limit: 20, storeEnabled: false };
    }
    const p = Math.max(1, Number(page) || 1);
    const l = Math.min(100, Math.max(1, Number(limit) || 20));
    const where = this.buildProductWhere({
      search,
      category,
      published: true,
    });
    const [items, total] = await Promise.all([
      this.repo.findProducts({ skip: (p - 1) * l, take: l, where }),
      this.repo.countProducts(where),
    ]);
    return { items, total, page: p, limit: l, storeEnabled: true };
  }

  async updateProduct(id: string, dto: UpdateMarketplaceProductDto) {
    await this.findProductById(id);
    const data: Prisma.MarketplaceProductUpdateInput = {};

    if (dto.sku !== undefined) {
      const sku = dto.sku.trim();
      const clash = await this.repo.findProductBySku(sku);
      if (clash && clash.id !== id) {
        throw new ConflictException(`SKU '${sku}' already exists`);
      }
      data.sku = sku;
    }
    if (dto.slug !== undefined) {
      data.slug = await this.ensureUniqueSlug(dto.slug.trim().toLowerCase(), id);
    }
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.priceCents !== undefined) data.priceCents = dto.priceCents;
    if (dto.discountPercent !== undefined) {
      data.discountPercent = clampDiscountPercent(dto.discountPercent);
    }
    if (dto.promoDiscountPercent !== undefined) {
      data.promoDiscountPercent = clampDiscountPercent(dto.promoDiscountPercent);
    }
    if (dto.currency !== undefined) data.currency = dto.currency.toUpperCase();
    if (dto.stockQty !== undefined) data.stockQty = dto.stockQty;
    if (dto.published !== undefined) data.published = dto.published;
    if (dto.traceProductId !== undefined) {
      if (dto.traceProductId === null) {
        data.traceProduct = { disconnect: true };
      } else {
        await this.assertTraceProduct(dto.traceProductId);
        data.traceProduct = { connect: { id: dto.traceProductId } };
      }
    }

    return this.repo.updateProduct(id, data);
  }

  async removeProduct(id: string) {
    const product = await this.findProductById(id);
    for (const img of product.images) {
      if (!img.key.startsWith('external:')) {
        await this.storage.deleteObject(img.key).catch(() => undefined);
      }
    }
    return this.repo.deleteProduct(id);
  }

  async uploadImage(
    productId: string,
    file: Express.Multer.File,
    isPrimary?: boolean,
  ) {
    const product = await this.findProductById(productId);
    if (!file?.buffer?.length) {
      throw new BadRequestException('Image file is required');
    }
    if (product.images.length >= PRODUCT_IMAGE_MAX_COUNT) {
      throw new BadRequestException(
        `Máximo ${PRODUCT_IMAGE_MAX_COUNT} fotos por producto.`,
      );
    }
    assertProductImageSize(file.size ?? file.buffer.length);
    const mimeType = sniffProductImageMime(file.buffer);
    const s3Config = this.storage.isS3Configured()
      ? this.storage.requireConfig()
      : null;
    const keyPrefix = s3Config?.keyPrefix ?? DEFAULT_MARKETPLACE_KEY_PREFIX;
    const imageId = randomUUID();
    const storageKey = productImageObjectKey({
      prefix: keyPrefix,
      skuCode: product.sku,
      imageId,
      mimeType,
    });

    await this.storage.putObject({
      key: storageKey,
      body: file.buffer,
      contentType: mimeType,
    });

    try {
      if (isPrimary) {
        await this.repo.clearPrimaryImages(productId);
      }
      const makePrimary = isPrimary || product.images.length === 0;
      const url = this.storage.publicUrl(storageKey) ?? '';

      return this.repo.createImage({
        id: imageId,
        product: { connect: { id: productId } },
        url,
        key: storageKey,
        sortOrder: product.images.length,
        isPrimary: makePrimary,
      });
    } catch (error) {
      await this.storage.deleteObject(storageKey).catch(() => undefined);
      throw error;
    }
  }

  /** Register an external image URL without uploading to S3. */
  async addImageByUrl(productId: string, url: string, isPrimary?: boolean) {
    const product = await this.findProductById(productId);
    if (product.images.length >= PRODUCT_IMAGE_MAX_COUNT) {
      throw new BadRequestException(
        `Máximo ${PRODUCT_IMAGE_MAX_COUNT} fotos por producto.`,
      );
    }
    const normalized = url.trim();
    if (!/^https?:\/\//i.test(normalized)) {
      throw new BadRequestException('url must be an absolute http(s) URL');
    }
    // key prefix marks non-owned objects so delete skips storage
    const key = `external:${normalized.slice(0, 500)}`;
    return this.attachImage(productId, normalized, key, isPrimary);
  }

  private async attachImage(
    productId: string,
    url: string,
    key: string,
    isPrimary?: boolean,
  ) {
    if (isPrimary) {
      await this.repo.clearPrimaryImages(productId);
    }

    const product = await this.findProductById(productId);
    const makePrimary = isPrimary || product.images.length === 0;

    return this.repo.createImage({
      product: { connect: { id: productId } },
      url,
      key,
      sortOrder: product.images.length,
      isPrimary: makePrimary,
    });
  }

  async resolveProductImageMedia(imageId: string) {
    const image = await this.repo.findImageById(imageId);
    if (!image) {
      throw new NotFoundException('Image not found');
    }
    if (image.key.startsWith('external:')) {
      const url =
        image.url?.trim() || image.key.slice('external:'.length).trim();
      if (!/^https?:\/\//i.test(url)) {
        throw new BadRequestException('External image URL is missing or invalid');
      }
      const bucket = readS3StorageConfig()?.bucket ?? null;
      const s3Key = parseAwsS3ObjectKeyFromUrl(url, bucket);
      if (s3Key && this.storage.isS3Configured()) {
        const object = await this.storage.getObject(s3Key);
        return {
          mode: 'stream' as const,
          bytes: object.body,
          mimeType: object.contentType,
        };
      }
      return { mode: 'redirect' as const, url };
    }
    const object = await this.storage.getObject(image.key);
    return {
      mode: 'stream' as const,
      bytes: object.body,
      mimeType: object.contentType,
    };
  }

  async getStoredImage(imageId: string) {
    const media = await this.resolveProductImageMedia(imageId);
    if (media.mode === 'redirect') {
      throw new BadRequestException(
        'External images are served by their public URL, not via media proxy',
      );
    }
    return { bytes: media.bytes, mimeType: media.mimeType };
  }

  async deleteImage(productId: string, imageId: string) {
    await this.findProductById(productId);
    const image = await this.repo.findImageById(imageId);
    if (!image || image.productId !== productId) {
      throw new NotFoundException('Image not found');
    }
    if (!image.key.startsWith('external:')) {
      await this.storage.deleteObject(image.key).catch(() => undefined);
    }
    await this.repo.deleteImage(imageId);
    return { deleted: true };
  }

  async setPrimaryImage(productId: string, imageId: string) {
    await this.findProductById(productId);
    const image = await this.repo.findImageById(imageId);
    if (!image || image.productId !== productId) {
      throw new NotFoundException('Image not found');
    }
    await this.repo.clearPrimaryImages(productId);
    await this.repo.setPrimaryImage(imageId);
    return this.findProductById(productId);
  }

  // ─── Settings ─────────────────────────────────────────────────────────────

  private bankTransferDetailsFromSettings(s: {
    bankTransferEnabled: boolean;
    bankName: string | null;
    bankAccountType: string | null;
    bankAccountNumber: string | null;
    bankBeneficiaryName: string | null;
    bankBeneficiaryRuc: string | null;
    bankContactEmail: string | null;
  }) {
    const complete =
      !!s.bankName?.trim() &&
      !!s.bankAccountType?.trim() &&
      !!s.bankAccountNumber?.trim() &&
      !!s.bankBeneficiaryName?.trim() &&
      !!s.bankBeneficiaryRuc?.trim();
    if (!s.bankTransferEnabled || !complete) return null;
    return {
      bankName: s.bankName!.trim(),
      bankAccountType: s.bankAccountType!.trim(),
      bankAccountNumber: s.bankAccountNumber!.trim(),
      bankBeneficiaryName: s.bankBeneficiaryName!.trim(),
      bankBeneficiaryRuc: s.bankBeneficiaryRuc!.trim(),
      bankContactEmail: s.bankContactEmail?.trim() || null,
    };
  }

  async getPublicSettings() {
    const s = await this.repo.getSettings();
    const paypalMode = this.paypal.isCheckoutAvailable(s.onlinePaymentsEnabled)
      ? this.paypal.getProviderMode()
      : 'off';
    const bankTransfer = this.bankTransferDetailsFromSettings(s);
    return {
      storeEnabled: s.storeEnabled,
      onlinePaymentsEnabled: s.onlinePaymentsEnabled,
      paypalAvailable: this.paypal.isCheckoutAvailable(s.onlinePaymentsEnabled),
      paypalMode,
      cardPaymentsEnabled: s.cardPaymentsEnabled,
      payphoneAvailable: this.payphone.isCheckoutAvailable(
        s.cardPaymentsEnabled,
      ),
      bankTransferEnabled: !!bankTransfer,
      bankTransfer,
    };
  }

  async getAdminSettings() {
    return this.repo.getSettings();
  }

  async updateSettings(dto: UpdateMarketplaceSettingsDto) {
    const data: Prisma.MarketplaceSettingsUpdateInput = {};
    if (dto.orderNotificationEmail !== undefined) {
      data.orderNotificationEmail = dto.orderNotificationEmail?.trim() || null;
    }
    if (dto.storeEnabled !== undefined) data.storeEnabled = dto.storeEnabled;
    if (dto.onlinePaymentsEnabled !== undefined) {
      data.onlinePaymentsEnabled = dto.onlinePaymentsEnabled;
    }
    if (dto.cardPaymentsEnabled !== undefined) {
      data.cardPaymentsEnabled = dto.cardPaymentsEnabled;
    }
    if (dto.bankTransferEnabled !== undefined) {
      data.bankTransferEnabled = dto.bankTransferEnabled;
    }
    if (dto.bankName !== undefined) {
      data.bankName = dto.bankName?.trim() || null;
    }
    if (dto.bankAccountType !== undefined) {
      data.bankAccountType = dto.bankAccountType?.trim() || null;
    }
    if (dto.bankAccountNumber !== undefined) {
      data.bankAccountNumber = dto.bankAccountNumber?.trim() || null;
    }
    if (dto.bankBeneficiaryName !== undefined) {
      data.bankBeneficiaryName = dto.bankBeneficiaryName?.trim() || null;
    }
    if (dto.bankBeneficiaryRuc !== undefined) {
      data.bankBeneficiaryRuc = dto.bankBeneficiaryRuc?.trim() || null;
    }
    if (dto.bankContactEmail !== undefined) {
      data.bankContactEmail = dto.bankContactEmail?.trim() || null;
    }
    if (dto.fromName !== undefined) {
      data.fromName = dto.fromName?.trim() || null;
    }
    return this.repo.updateSettings(data);
  }

  // ─── Orders ───────────────────────────────────────────────────────────────

  async placeOrder(dto: CreateMarketplaceOrderDto) {
    const method = dto.paymentMethod ?? OrderPaymentMethodDto.EMAIL;
    if (method === OrderPaymentMethodDto.PAYPAL) {
      return this.startPayPalCheckout(dto);
    }
    if (method === OrderPaymentMethodDto.CARD) {
      return this.startCardCheckout(dto);
    }
    if (
      method === OrderPaymentMethodDto.BANK_TRANSFER ||
      method === OrderPaymentMethodDto.EMAIL
    ) {
      return this.placeOfflineOrder(dto, method);
    }
    throw new BadRequestException('Invalid payment method');
  }

  async placeOfflineOrder(
    dto: CreateMarketplaceOrderDto,
    method:
      | OrderPaymentMethodDto.EMAIL
      | OrderPaymentMethodDto.BANK_TRANSFER,
  ) {
    const settings = await this.repo.getSettings();
    if (!settings.storeEnabled) {
      throw new BadRequestException('Store is currently disabled');
    }

    if (method === OrderPaymentMethodDto.BANK_TRANSFER) {
      const bank = this.bankTransferDetailsFromSettings(settings);
      if (!bank) {
        throw new BadRequestException('Bank transfer is not available');
      }
    }

    const phoneRaw = dto.customerPhone?.trim();
    const phone = normalizePhoneE164(phoneRaw);
    if (!phone) {
      throw new BadRequestException(
        'A valid customer phone is required for offline payment methods',
      );
    }

    const paymentMethod =
      method === OrderPaymentMethodDto.BANK_TRANSFER
        ? MarketplacePaymentMethod.BANK_TRANSFER
        : MarketplacePaymentMethod.EMAIL;

    const mergedLines = this.mergeOrderLines(dto.items);
    const orderNumber = this.generateOrderNumber();
    let order;
    try {
      order = await this.repo.createAwaitingOfflineOrder({
        orderNumber,
        customerName: dto.customerName.trim(),
        customerEmail: dto.customerEmail.trim().toLowerCase(),
        customerPhone: phone,
        customerAddress: dto.customerAddress?.trim(),
        notes: dto.notes?.trim(),
        currency: 'USD',
        paymentMethod,
        notifyWhatsapp: dto.notifyWhatsapp !== false,
        lines: mergedLines,
      });
    } catch (err) {
      this.rethrowOrderPlacementError(err);
    }

    return this.sendOrderEmails(
      order,
      settings,
      MarketplaceOrderStatus.AWAITING_PAYMENT,
      MarketplaceOrderStatus.AWAITING_PAYMENT,
    );
  }

  /** @deprecated Prefer placeOfflineOrder — kept for callers that still expect old name. */
  async placeOrderEmail(dto: CreateMarketplaceOrderDto) {
    return this.placeOfflineOrder(dto, OrderPaymentMethodDto.EMAIL);
  }

  async startPayPalCheckout(dto: CreateMarketplaceOrderDto) {
    const settings = await this.repo.getSettings();
    if (!settings.storeEnabled) {
      throw new BadRequestException('Store is currently disabled');
    }
    if (!this.paypal.isCheckoutAvailable(settings.onlinePaymentsEnabled)) {
      throw new BadRequestException('Online payments are not available');
    }

    const phone = normalizePhoneE164(dto.customerPhone?.trim()) ?? null;

    const mergedLines = this.mergeOrderLines(dto.items);
    const orderNumber = this.generateOrderNumber();
    let order;
    try {
      order = await this.repo.createPendingPayPalOrder({
        orderNumber,
        customerName: dto.customerName.trim(),
        customerEmail: dto.customerEmail.trim().toLowerCase(),
        customerPhone: phone ?? undefined,
        customerAddress: dto.customerAddress?.trim(),
        notes: dto.notes?.trim(),
        currency: 'USD',
        notifyWhatsapp: dto.notifyWhatsapp !== false,
        lines: mergedLines,
      });
    } catch (err) {
      this.rethrowOrderPlacementError(err);
    }

    const frontendBase = (
      this.config.get<string>('frontendUrl') ?? 'http://localhost:4200'
    ).replace(/\/$/, '');
    const returnUrl = `${frontendBase}/tienda/pedido/${encodeURIComponent(order.orderNumber)}/pago`;
    const cancelUrl = `${frontendBase}/tienda/checkout?cancelled=1&orderNumber=${encodeURIComponent(order.orderNumber)}`;

    try {
      const created = await this.paypal.createCheckoutOrder({
        orderNumber: order.orderNumber,
        amountCents: order.subtotalCents,
        currency: order.currency,
        returnUrl,
        cancelUrl,
      });
      const updated = await this.repo.updateOrder(order.id, {
        paypalOrderId: created.paypalOrderId,
      });
      const confirmationUrl = `${frontendBase}/tienda/pedido/${encodeURIComponent(order.orderNumber)}`;
      await this.notifyOrderWhatsapp({
        order: updated,
        settings,
        phase: 'awaiting',
        confirmationUrl,
      });
      return {
        ...updated,
        approveUrl: created.approveUrl,
        paypalMode: this.paypal.getProviderMode(),
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'PayPal create failed';
      await this.repo.updateOrder(order.id, {
        status: MarketplaceOrderStatus.PAYMENT_FAILED,
        paymentError: reason,
      });
      throw new BadRequestException(`Unable to start PayPal checkout: ${reason}`);
    }
  }

  async startCardCheckout(dto: CreateMarketplaceOrderDto) {
    const settings = await this.repo.getSettings();
    if (!settings.storeEnabled) {
      throw new BadRequestException('Store is currently disabled');
    }
    if (!this.payphone.isCheckoutAvailable(settings.cardPaymentsEnabled)) {
      throw new BadRequestException('Card payments are not available');
    }

    const phoneRaw = dto.customerPhone?.trim();
    const phone = normalizePhoneE164(phoneRaw);
    if (!phone) {
      throw new BadRequestException(
        'A valid customer phone is required for card payment',
      );
    }

    const mergedLines = this.mergeOrderLines(dto.items);
    const orderNumber = this.generateOrderNumber();
    // clientTransactionId ≤ 50 chars (Payphone)
    const clientTransactionId = truncateClientTxId(
      `PP-${orderNumber}-${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    );

    let order;
    try {
      order = await this.repo.createPendingCardOrder({
        orderNumber,
        customerName: dto.customerName.trim(),
        customerEmail: dto.customerEmail.trim().toLowerCase(),
        customerPhone: phone,
        customerAddress: dto.customerAddress?.trim(),
        notes: dto.notes?.trim(),
        currency: 'USD',
        payphoneClientTxId: clientTransactionId,
        notifyWhatsapp: dto.notifyWhatsapp !== false,
        computeTax: (subtotalCents) => {
          const amounts = this.payphone.buildAmounts(subtotalCents);
          return { taxCents: amounts.tax, totalCents: amounts.amount };
        },
        lines: mergedLines,
      });
    } catch (err) {
      this.rethrowOrderPlacementError(err);
    }

    const box = this.payphone.buildBoxConfig({
      clientTransactionId,
      subtotalCents: order.subtotalCents,
      currency: order.currency,
      orderNumber: order.orderNumber,
      email: order.customerEmail,
      phoneNumber: order.customerPhone ?? undefined,
    });

    const frontendBase = (
      this.config.get<string>('frontendUrl') ?? 'http://localhost:4200'
    ).replace(/\/$/, '');
    await this.notifyOrderWhatsapp({
      order,
      settings,
      phase: 'awaiting',
      confirmationUrl: `${frontendBase}/tienda/pedido/${encodeURIComponent(order.orderNumber)}`,
    });

    return {
      ...order,
      clientTransactionId,
      payment: box,
    };
  }

  async confirmCardPayment(dto: ConfirmPayphonePaymentDto) {
    const clientTxId = truncateClientTxId(dto.clientTransactionId);
    const paymentRow = await this.repo.findPaymentByClientTxId(clientTxId);
    const order =
      paymentRow?.order ??
      (await this.repo.findOrderByPayphoneClientTxId(clientTxId));

    if (!order) {
      throw new NotFoundException('Order not found for this payment');
    }

    if (
      order.status === MarketplaceOrderStatus.PAID ||
      order.status === MarketplaceOrderStatus.EMAILED
    ) {
      return {
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: 'CONFIRMED' as const,
      };
    }

    if (order.status !== MarketplaceOrderStatus.AWAITING_PAYMENT) {
      throw new BadRequestException('Order is not awaiting payment');
    }

    if (
      order.payphoneClientTxId &&
      order.payphoneClientTxId !== clientTxId
    ) {
      throw new BadRequestException('clientTransactionId mismatch');
    }

    const confirm = await this.payphone.confirmTransaction(
      dto.payphoneId,
      clientTxId,
    );

    if (!this.payphone.isApproved(confirm)) {
      const reason =
        confirm.message ||
        confirm.transactionStatus ||
        `Payphone statusCode ${confirm.statusCode ?? 'unknown'}`;
      if (paymentRow) {
        await this.repo.updatePayment(paymentRow.id, {
          status: 'FAILED',
          payphoneId: dto.payphoneId,
          rawResponse: confirm as unknown as Prisma.InputJsonValue,
        });
      }
      await this.repo.updateOrder(order.id, {
        status: MarketplaceOrderStatus.PAYMENT_FAILED,
        paymentError: reason,
      });

      const settings = await this.repo.getSettings();
      try {
        await this.sendPaymentFailedAdminNotice(order, settings, reason);
      } catch (mailErr) {
        this.logger.warn(
          `Payment-failed admin email skipped for ${order.orderNumber}: ${
            mailErr instanceof Error ? mailErr.message : String(mailErr)
          }`,
        );
      }

      throw new BadRequestException({
        message: 'Payment was not approved',
        details: { transactionStatus: confirm.transactionStatus, reason },
      });
    }

    const expectedAmount = order.totalCents || order.subtotalCents;
    if (
      typeof confirm.amount === 'number' &&
      confirm.amount > 0 &&
      confirm.amount !== expectedAmount
    ) {
      this.logger.warn(
        `Payphone amount mismatch for ${order.orderNumber}: expected ${expectedAmount}, got ${confirm.amount}`,
      );
      if (paymentRow) {
        await this.repo.updatePayment(paymentRow.id, {
          status: 'FAILED',
          payphoneId: dto.payphoneId,
          rawResponse: confirm as unknown as Prisma.InputJsonValue,
        });
      }
      await this.repo.updateOrder(order.id, {
        status: MarketplaceOrderStatus.PAYMENT_FAILED,
        paymentError: `Amount mismatch: expected ${expectedAmount}, got ${confirm.amount}`,
      });
      throw new BadRequestException('Payment amount mismatch');
    }

    if (
      confirm.currency &&
      confirm.currency.toUpperCase() !== order.currency.toUpperCase()
    ) {
      await this.repo.updateOrder(order.id, {
        status: MarketplaceOrderStatus.PAYMENT_FAILED,
        paymentError: `Currency mismatch: ${confirm.currency}`,
      });
      throw new BadRequestException('Payment currency mismatch');
    }

    try {
      await this.repo.decrementStockForOrder(order.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.repo.updateOrder(order.id, {
        status: MarketplaceOrderStatus.PAYMENT_FAILED,
        paymentError: msg,
      });
      this.rethrowOrderPlacementError(err);
    }

    if (paymentRow) {
      await this.repo.updatePayment(paymentRow.id, {
        status: 'CONFIRMED',
        payphoneId: dto.payphoneId,
        authorizationCode: confirm.authorizationCode ?? null,
        transactionId:
          confirm.transactionId != null ? String(confirm.transactionId) : null,
        rawResponse: confirm as unknown as Prisma.InputJsonValue,
        confirmedAt: new Date(),
      });
    }

    const paid = await this.repo.updateOrder(order.id, {
      status: MarketplaceOrderStatus.PAID,
      paidAt: new Date(),
      paymentError: null,
    });

    const settings = await this.repo.getSettings();
    const emailed = await this.sendOrderEmails(
      {
        ...paid,
        taxCents: paid.taxCents,
        totalCents: paid.totalCents,
        authorizationCode: confirm.authorizationCode ?? null,
        payphoneTransactionId:
          confirm.transactionId != null ? String(confirm.transactionId) : null,
      },
      settings,
      MarketplaceOrderStatus.PAID,
      MarketplaceOrderStatus.PAID,
      true,
    );

    return {
      orderNumber: emailed.orderNumber,
      status: emailed.status,
      paymentStatus: 'CONFIRMED' as const,
    };
  }

  private async sendPaymentFailedAdminNotice(
    order: {
      orderNumber: string;
      customerName: string;
      customerEmail: string;
      customerPhone: string | null;
      customerAddress: string | null;
      notes: string | null;
      subtotalCents: number;
      listSubtotalCents: number;
      discountTotalCents: number;
      taxCents?: number;
      totalCents?: number;
      currency: string;
      paymentMethod?: MarketplacePaymentMethod | string;
      items: Array<{
        name: string;
        sku: string;
        qty: number;
        listUnitPriceCents: number;
        discountPercent: number;
        promoDiscountPercent: number;
        unitPriceCents: number;
      }>;
    },
    settings: {
      orderNotificationEmail: string | null;
      fromName: string | null;
      bankTransferEnabled: boolean;
      bankName: string | null;
      bankAccountType: string | null;
      bankAccountNumber: string | null;
      bankBeneficiaryName: string | null;
      bankBeneficiaryRuc: string | null;
      bankContactEmail: string | null;
    },
    reason: string,
  ) {
    const to = this.resolveOrderNotificationTo(settings);
    if (!to) return;
    await this.mail.sendMarketplaceOrderToStore({
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      customerPhone: order.customerPhone,
      customerAddress: order.customerAddress,
      notes: order.notes
        ? `${order.notes}\n\n[Pago fallido] ${reason}`
        : `[Pago fallido] ${reason}`,
      subtotalCents: order.subtotalCents,
      listSubtotalCents: order.listSubtotalCents,
      discountTotalCents: order.discountTotalCents,
      taxCents: order.taxCents ?? 0,
      totalCents: order.totalCents ?? order.subtotalCents,
      currency: order.currency,
      paymentMethod: order.paymentMethod ?? MarketplacePaymentMethod.CARD,
      paymentConfirmed: false,
      emailKind: 'PAYMENT_FAILED',
      items: order.items.map((i) => ({
        name: i.name,
        sku: i.sku,
        qty: i.qty,
        listUnitPriceCents: i.listUnitPriceCents,
        discountPercent: i.discountPercent,
        promoDiscountPercent: i.promoDiscountPercent,
        unitPriceCents: i.unitPriceCents,
      })),
      fromName: settings.fromName,
      to,
    });
  }

  private resolveOrderNotificationTo(settings: {
    orderNotificationEmail: string | null;
  }): string {
    return (
      settings.orderNotificationEmail?.trim() ||
      this.config.get<string>('contactEmail')?.trim() ||
      ''
    );
  }

  async capturePayPalOrder(
    orderNumber: string,
    dto: CapturePayPalOrderDto,
  ) {
    const order = await this.repo.findOrderByNumber(orderNumber);
    if (!order) throw new NotFoundException('Order not found');

    if (
      order.status === MarketplaceOrderStatus.EMAILED ||
      order.status === MarketplaceOrderStatus.PAID ||
      (order.paypalCaptureId &&
        order.status !== MarketplaceOrderStatus.AWAITING_PAYMENT)
    ) {
      return order;
    }

    if (order.status !== MarketplaceOrderStatus.AWAITING_PAYMENT) {
      throw new BadRequestException('Order is not awaiting payment');
    }
    if (
      order.paypalOrderId &&
      order.paypalOrderId !== dto.paypalOrderId
    ) {
      throw new BadRequestException('PayPal order id mismatch');
    }

    if (
      this.paypal.getProviderMode() === 'mock' &&
      dto.sig &&
      !this.paypal.verifyMockSignature(
        dto.paypalOrderId,
        order.orderNumber,
        dto.sig,
      )
    ) {
      throw new BadRequestException('Invalid mock payment signature');
    }

    try {
      await this.repo.decrementStockForOrder(order.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.repo.updateOrder(order.id, {
        status: MarketplaceOrderStatus.PAYMENT_FAILED,
        paymentError: msg,
      });
      this.rethrowOrderPlacementError(err);
    }

    const capture = await this.paypal.captureOrder(dto.paypalOrderId);
    if (capture.status !== 'COMPLETED') {
      // Stock already decremented — restock so inventory stays accurate.
      try {
        await this.repo.restockOrderItems(order.id);
      } catch (restockErr) {
        this.logger.error(
          `Failed to restock after capture failure ${order.orderNumber}: ${
            restockErr instanceof Error ? restockErr.message : String(restockErr)
          }`,
        );
      }
      await this.repo.updateOrder(order.id, {
        status: MarketplaceOrderStatus.PAYMENT_FAILED,
        paymentError: `Capture status: ${capture.status}`,
      });
      throw new BadRequestException('PayPal capture failed');
    }

    if (
      capture.amountCents > 0 &&
      capture.amountCents !== order.subtotalCents
    ) {
      this.logger.warn(
        `PayPal amount mismatch for ${order.orderNumber}: expected ${order.subtotalCents}, got ${capture.amountCents}`,
      );
    }

    const paid = await this.repo.updateOrder(order.id, {
      status: MarketplaceOrderStatus.PAID,
      paypalCaptureId: capture.captureId,
      paidAt: new Date(),
      paymentError: null,
    });

    const settings = await this.repo.getSettings();
    return this.sendOrderEmails(
      paid,
      settings,
      MarketplaceOrderStatus.PAID,
      MarketplaceOrderStatus.PAID,
      true,
    );
  }

  async confirmOfflinePayment(id: string) {
    const order = await this.findOrderById(id);
    if (order.status === MarketplaceOrderStatus.PAID) {
      throw new BadRequestException('Order is already paid');
    }
    if (order.status !== MarketplaceOrderStatus.AWAITING_PAYMENT) {
      throw new BadRequestException('Order is not awaiting payment');
    }
    if (
      order.paymentMethod !== MarketplacePaymentMethod.EMAIL &&
      order.paymentMethod !== MarketplacePaymentMethod.BANK_TRANSFER
    ) {
      throw new BadRequestException(
        'Only offline payment methods can be confirmed manually',
      );
    }

    try {
      await this.repo.decrementStockForOrder(order.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.repo.updateOrder(order.id, {
        status: MarketplaceOrderStatus.PAYMENT_FAILED,
        paymentError: msg,
      });
      this.rethrowOrderPlacementError(err);
    }

    const paid = await this.repo.updateOrder(order.id, {
      status: MarketplaceOrderStatus.PAID,
      paidAt: new Date(),
      paymentError: null,
    });

    const settings = await this.repo.getSettings();
    return this.sendOrderEmails(
      paid,
      settings,
      MarketplaceOrderStatus.PAID,
      MarketplaceOrderStatus.PAID,
      true,
    );
  }

  private async sendOrderEmails(
    order: {
      id: string;
      orderNumber: string;
      customerName: string;
      customerEmail: string;
      customerPhone: string | null;
      customerAddress: string | null;
      notes: string | null;
      subtotalCents: number;
      listSubtotalCents: number;
      discountTotalCents: number;
      taxCents?: number;
      totalCents?: number;
      currency: string;
      paymentMethod?: MarketplacePaymentMethod | string;
      notifyWhatsapp?: boolean;
      authorizationCode?: string | null;
      payphoneTransactionId?: string | null;
      items: Array<{
        name: string;
        sku: string;
        qty: number;
        listUnitPriceCents: number;
        discountPercent: number;
        promoDiscountPercent: number;
        unitPriceCents: number;
      }>;
    },
    settings: {
      orderNotificationEmail: string | null;
      fromName: string | null;
      bankTransferEnabled: boolean;
      bankName: string | null;
      bankAccountType: string | null;
      bankAccountNumber: string | null;
      bankBeneficiaryName: string | null;
      bankBeneficiaryRuc: string | null;
      bankContactEmail: string | null;
    },
    emailFailureStatus: MarketplaceOrderStatus = MarketplaceOrderStatus.PENDING,
    successStatus: MarketplaceOrderStatus = MarketplaceOrderStatus.EMAILED,
    paymentConfirmed = false,
  ) {
    const to = this.resolveOrderNotificationTo(settings);

    if (!to) {
      const updated = await this.repo.updateOrder(order.id, {
        emailError: 'No order notification email configured',
      });
      await this.notifyOrderWhatsapp({
        order: { ...order, ...updated },
        settings,
        phase: paymentConfirmed ? 'paid' : 'awaiting',
        confirmationUrl: `${(
          this.config.get<string>('frontendUrl') ?? 'http://localhost:4200'
        ).replace(/\/$/, '')}/tienda/pedido/${encodeURIComponent(order.orderNumber)}`,
      });
      return updated;
    }

    const bankTransfer =
      order.paymentMethod === MarketplacePaymentMethod.BANK_TRANSFER
        ? this.bankTransferDetailsFromSettings(settings)
        : null;

    const emailKind =
      paymentConfirmed || order.paymentMethod === MarketplacePaymentMethod.CARD
        ? ('ORDER_PAID' as const)
        : ('ORDER_REQUEST' as const);

    const emailBase = {
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      customerPhone: order.customerPhone,
      customerAddress: order.customerAddress,
      notes: order.notes,
      subtotalCents: order.subtotalCents,
      listSubtotalCents: order.listSubtotalCents,
      discountTotalCents: order.discountTotalCents,
      taxCents: order.taxCents ?? 0,
      totalCents: order.totalCents ?? order.subtotalCents,
      currency: order.currency,
      paymentMethod: order.paymentMethod,
      paymentConfirmed,
      emailKind: paymentConfirmed ? emailKind : ('ORDER_REQUEST' as const),
      authorizationCode: order.authorizationCode ?? undefined,
      payphoneTransactionId: order.payphoneTransactionId ?? undefined,
      bankTransfer,
      items: order.items.map((i) => ({
        name: i.name,
        sku: i.sku,
        qty: i.qty,
        listUnitPriceCents: i.listUnitPriceCents,
        discountPercent: i.discountPercent,
        promoDiscountPercent: i.promoDiscountPercent,
        unitPriceCents: i.unitPriceCents,
      })),
      fromName: settings.fromName,
    };

    const frontendBase = (
      this.config.get<string>('frontendUrl') ?? 'http://localhost:4200'
    ).replace(/\/$/, '');
    const orderConfirmationUrl = `${frontendBase}/tienda/pedido/${encodeURIComponent(order.orderNumber)}`;

    try {
      await this.mail.sendMarketplaceOrderToStore({ ...emailBase, to });

      let customerEmailError: string | null = null;
      try {
        await this.mail.sendMarketplaceOrderToCustomer({
          ...emailBase,
          to: order.customerEmail.trim(),
          orderConfirmationUrl,
        });
      } catch (customerErr) {
        const reason =
          customerErr instanceof Error ? customerErr.message : 'Email send failed';
        customerEmailError = `Cliente: ${reason}`;
        this.logger.error(
          `Customer order email failed for ${order.orderNumber}: ${reason}`,
        );
      }

      const updated = await this.repo.updateOrder(order.id, {
        status: successStatus,
        emailError: customerEmailError,
      });

      await this.notifyOrderWhatsapp({
        order: updated,
        settings,
        phase: paymentConfirmed ? 'paid' : 'awaiting',
        confirmationUrl: orderConfirmationUrl,
      });

      return updated;
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Email send failed';
      this.logger.error(`Order email failed for ${order.orderNumber}: ${reason}`);
      return this.repo.updateOrder(order.id, {
        status: emailFailureStatus,
        emailError: reason,
      });
    }
  }

  private async notifyOrderWhatsapp(args: {
    order: {
      id: string;
      orderNumber: string;
      customerName: string;
      customerPhone: string | null;
      subtotalCents: number;
      currency: string;
      paymentMethod?: MarketplacePaymentMethod | string;
      notifyWhatsapp?: boolean;
    };
    settings: {
      bankTransferEnabled: boolean;
      bankName: string | null;
      bankAccountType: string | null;
      bankAccountNumber: string | null;
      bankBeneficiaryName: string | null;
      bankBeneficiaryRuc: string | null;
      bankContactEmail: string | null;
    };
    phase: 'awaiting' | 'paid';
    confirmationUrl?: string;
  }): Promise<void> {
    const notifyInput = {
      id: args.order.id,
      orderNumber: args.order.orderNumber,
      customerName: args.order.customerName,
      customerPhone: args.order.customerPhone,
      subtotalCents: args.order.subtotalCents,
      currency: args.order.currency,
      paymentMethod: args.order.paymentMethod ?? MarketplacePaymentMethod.EMAIL,
      notifyWhatsapp: args.order.notifyWhatsapp !== false,
    };

    try {
      if (args.phase === 'awaiting') {
        await this.whatsapp.notifyMarketplacePendingAdmins(notifyInput);
        const bankTransfer =
          args.order.paymentMethod === MarketplacePaymentMethod.BANK_TRANSFER
            ? this.bankTransferDetailsFromSettings(args.settings)
            : null;
        await this.whatsapp.notifyCustomerOrderReceived(notifyInput, {
          bankTransfer,
          confirmationUrl: args.confirmationUrl,
        });
        return;
      }

      await this.whatsapp.notifyCustomerPaymentApproved(notifyInput);
    } catch (err) {
      this.logger.error(
        `WhatsApp notify failed for ${args.order.orderNumber}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private rethrowOrderPlacementError(err: unknown): never {
    const msg = err instanceof Error ? err.message : String(err);
    const stock = this.parseStockError(msg);
    if (stock) {
      throw new HttpException(
        {
          message: 'Insufficient stock',
          details: [stock],
        },
        HttpStatus.CONFLICT,
      );
    }
    if (msg.startsWith('UNAVAILABLE:')) {
      const productId = msg.slice('UNAVAILABLE:'.length);
      throw new BadRequestException({
        message: 'One or more products are unavailable',
        details: [{ productId }],
      });
    }
    if (msg === 'MIXED_CURRENCY') {
      throw new BadRequestException(
        'Cart contains products with different currencies',
      );
    }
    throw err;
  }

  async listOrders(page?: number, limit?: number, status?: string, search?: string) {
    const p = Math.max(1, Number(page) || 1);
    const l = Math.min(100, Math.max(1, Number(limit) || 20));
    const where: Prisma.MarketplaceOrderWhereInput = {};
    if (status && Object.values(MarketplaceOrderStatus).includes(status as MarketplaceOrderStatus)) {
      where.status = status as MarketplaceOrderStatus;
    }
    if (search?.trim()) {
      const q = search.trim();
      where.OR = [
        { orderNumber: { contains: q, mode: 'insensitive' } },
        { customerName: { contains: q, mode: 'insensitive' } },
        { customerEmail: { contains: q, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await Promise.all([
      this.repo.findOrders({ skip: (p - 1) * l, take: l, where }),
      this.repo.countOrders(where),
    ]);
    return { items, total, page: p, limit: l };
  }

  async findOrderById(id: string) {
    const order = await this.repo.findOrderById(id);
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async findOrderByNumberPublic(orderNumber: string) {
    const order = await this.repo.findOrderByNumber(orderNumber);
    if (!order) throw new NotFoundException('Order not found');
    const settings = await this.repo.getSettings();
    const bankTransfer =
      order.paymentMethod === MarketplacePaymentMethod.BANK_TRANSFER &&
      order.status === MarketplaceOrderStatus.AWAITING_PAYMENT
        ? this.bankTransferDetailsFromSettings(settings)
        : null;
    return {
      orderNumber: order.orderNumber,
      status: order.status,
      paymentMethod: order.paymentMethod,
      customerName: order.customerName,
      subtotalCents: order.subtotalCents,
      listSubtotalCents: order.listSubtotalCents,
      discountTotalCents: order.discountTotalCents,
      taxCents: order.taxCents,
      totalCents: order.totalCents || order.subtotalCents,
      currency: order.currency,
      paidAt: order.paidAt,
      bankTransfer,
      items: order.items.map((i) => ({
        name: i.name,
        sku: i.sku,
        qty: i.qty,
        listUnitPriceCents: i.listUnitPriceCents,
        discountPercent: i.discountPercent,
        promoDiscountPercent: i.promoDiscountPercent,
        unitPriceCents: i.unitPriceCents,
        imageUrl: i.imageUrl,
      })),
      createdAt: order.createdAt,
    };
  }

  async cancelOrder(id: string) {
    const order = await this.findOrderById(id);
    if (order.status === MarketplaceOrderStatus.CANCELLED) {
      throw new BadRequestException('Order already cancelled');
    }
    if (order.status === MarketplaceOrderStatus.AWAITING_PAYMENT) {
      return this.repo.cancelAwaitingPayment(id);
    }
    if (order.status === MarketplaceOrderStatus.PAYMENT_FAILED) {
      return this.repo.cancelAwaitingPayment(id);
    }
    return this.repo.restockOrderItems(id);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private buildProductWhere(opts: {
    search?: string;
    published?: boolean;
    category?: string;
  }): Prisma.MarketplaceProductWhereInput {
    const where: Prisma.MarketplaceProductWhereInput = {};
    if (opts.published !== undefined) where.published = opts.published;
    if (opts.category?.trim()) {
      where.category = { equals: opts.category.trim(), mode: 'insensitive' };
    }
    if (opts.search?.trim()) {
      const q = opts.search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { sku: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ];
    }
    return where;
  }

  private slugify(input: string): string {
    return input
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 100) || `product-${Date.now()}`;
  }

  private async ensureUniqueSlug(base: string, excludeId?: string): Promise<string> {
    let slug = base || `product-${Date.now()}`;
    let n = 0;
    for (;;) {
      const candidate = n === 0 ? slug : `${slug}-${n}`;
      const existing = await this.repo.findProductBySlug(candidate);
      if (!existing || existing.id === excludeId) return candidate;
      n += 1;
    }
  }

  private async assertTraceProduct(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new BadRequestException('traceProductId does not match an existing product');
    }
  }

  private generateOrderNumber(): string {
    const now = new Date();
    const y = now.getUTCFullYear().toString().slice(-2);
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `MA-${y}${m}${d}-${rand}`;
  }

  /** Sum qty when the same product appears more than once in the payload. */
  private mergeOrderLines(
    items: Array<{ productId: string; qty: number }>,
  ): Array<{ productId: string; qty: number }> {
    const byProduct = new Map<string, number>();
    for (const item of items) {
      const id = item.productId.trim();
      byProduct.set(id, (byProduct.get(id) ?? 0) + item.qty);
    }
    return [...byProduct.entries()].map(([productId, qty]) => ({
      productId,
      qty,
    }));
  }

  /** STOCK:productId:available:name — name may contain colons. */
  private parseStockError(
    msg: string,
  ): { productId: string; available: number; name: string } | null {
    const prefix = 'STOCK:';
    if (!msg.startsWith(prefix)) return null;
    const rest = msg.slice(prefix.length);
    const firstSep = rest.indexOf(':');
    if (firstSep < 0) return null;
    const productId = rest.slice(0, firstSep);
    const afterId = rest.slice(firstSep + 1);
    const secondSep = afterId.indexOf(':');
    if (secondSep < 0) return null;
    const available = Number(afterId.slice(0, secondSep));
    const name = afterId.slice(secondSep + 1);
    if (!productId || !Number.isFinite(available)) return null;
    return { productId, available, name };
  }
}
