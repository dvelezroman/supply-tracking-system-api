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
      const session =
        await this.repo.findOnlineCheckoutSessionByPaypalOrderId(paypalOrderId);
      const order = session
        ? null
        : await this.repo.findOrderByPaypalOrderId(paypalOrderId);
      const reference = session?.plannedOrderNumber ?? order?.orderNumber;
      if (
        !reference ||
        (order && order.status !== MarketplaceOrderStatus.AWAITING_PAYMENT)
      ) {
        return;
      }
      try {
        await this.capturePayPalOrder(reference, {
          paypalOrderId,
        });
      } catch (err) {
        this.logger.error(
          `Webhook capture failed for ${reference}: ${
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
  //
  // Notification policy:
  // - EMAIL / BANK_TRANSFER: notify customer + admin on place (how to pay / review).
  // - PAYPAL / CARD (Payphone): notify only after payment is confirmed.
  //

  private isOnlinePaymentMethod(
    method: MarketplacePaymentMethod | string | null | undefined,
  ): boolean {
    return (
      method === MarketplacePaymentMethod.CARD ||
      method === MarketplacePaymentMethod.PAYPAL
    );
  }

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
    const plannedOrderNumber = this.generateOrderNumber();
    let session;
    try {
      session = await this.repo.createOnlineCheckoutSession({
        paymentMethod: MarketplacePaymentMethod.PAYPAL,
        plannedOrderNumber,
        customerName: dto.customerName.trim(),
        customerEmail: dto.customerEmail.trim().toLowerCase(),
        customerPhone: phone ?? undefined,
        customerAddress: dto.customerAddress?.trim(),
        notes: dto.notes?.trim(),
        notifyWhatsapp: dto.notifyWhatsapp !== false,
        lines: mergedLines,
      });
    } catch (err) {
      this.rethrowOrderPlacementError(err);
    }

    const frontendBase = (
      this.config.get<string>('frontendUrl') ?? 'http://localhost:4200'
    ).replace(/\/$/, '');
    const returnUrl = `${frontendBase}/tienda/pedido/${encodeURIComponent(plannedOrderNumber)}/pago`;
    const cancelUrl = `${frontendBase}/tienda/checkout?cancelled=1`;

    try {
      const created = await this.paypal.createCheckoutOrder({
        orderNumber: plannedOrderNumber,
        amountCents: session.subtotalCents,
        currency: session.currency,
        returnUrl,
        cancelUrl,
      });
      await this.repo.updateOnlineCheckoutSessionPaypalOrderId(
        session.id,
        created.paypalOrderId,
      );
      return {
        orderNumber: plannedOrderNumber,
        subtotalCents: session.subtotalCents,
        currency: session.currency,
        paymentMethod: MarketplacePaymentMethod.PAYPAL,
        approveUrl: created.approveUrl,
        paypalMode: this.paypal.getProviderMode(),
      };
    } catch (err) {
      await this.repo.deleteOnlineCheckoutSession(session.id).catch(() => undefined);
      const reason = err instanceof Error ? err.message : 'PayPal create failed';
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
    const plannedOrderNumber = this.generateOrderNumber();
    const clientTransactionId = truncateClientTxId(
      `PP-${plannedOrderNumber}-${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    );

    let session;
    try {
      session = await this.repo.createOnlineCheckoutSession({
        paymentMethod: MarketplacePaymentMethod.CARD,
        plannedOrderNumber,
        clientTransactionId,
        customerName: dto.customerName.trim(),
        customerEmail: dto.customerEmail.trim().toLowerCase(),
        customerPhone: phone,
        customerAddress: dto.customerAddress?.trim(),
        notes: dto.notes?.trim(),
        notifyWhatsapp: dto.notifyWhatsapp !== false,
        lines: mergedLines,
        computeTax: (subtotalCents) => {
          const amounts = this.payphone.buildAmounts(subtotalCents);
          return { taxCents: amounts.tax, totalCents: amounts.amount };
        },
      });
    } catch (err) {
      this.rethrowOrderPlacementError(err);
    }

    return this.buildCardCheckoutResponse(session, clientTransactionId);
  }

  /** Drop pre-payment CARD session when buyer closes Cajita (no order row exists). */
  async abandonCardCheckoutSession(clientTransactionId: string) {
    const txId = truncateClientTxId(clientTransactionId);
    await this.repo.deleteOnlineCheckoutSessionByClientTxId(txId);
    return { discarded: true, clientTransactionId: txId };
  }

  /** @deprecated Legacy path param — deletes session by planned reference if still open. */
  async abandonCardCheckout(orderNumber: string) {
    const session =
      await this.repo.findOnlineCheckoutSessionByPlannedOrderNumber(orderNumber);
    if (session?.clientTransactionId) {
      return this.abandonCardCheckoutSession(session.clientTransactionId);
    }
    return { discarded: true, orderNumber };
  }

  private buildCardCheckoutResponse(
    session: {
      subtotalCents: number;
      totalCents: number;
      currency: string;
      plannedOrderNumber: string;
      customerEmail: string;
      customerPhone: string | null;
    },
    clientTransactionId: string,
  ) {
    const box = this.payphone.buildBoxConfig({
      clientTransactionId,
      subtotalCents: session.subtotalCents,
      currency: session.currency,
      orderNumber: session.plannedOrderNumber,
      email: session.customerEmail,
      phoneNumber: session.customerPhone ?? undefined,
    });
    return {
      clientTransactionId,
      payment: box,
      paymentMethod: MarketplacePaymentMethod.CARD,
    };
  }

  async confirmCardPayment(dto: ConfirmPayphonePaymentDto) {
    const clientTxId = truncateClientTxId(dto.clientTransactionId);

    const existingOrder =
      await this.repo.findOrderByPayphoneClientTxId(clientTxId);
    if (
      existingOrder &&
      (existingOrder.status === MarketplaceOrderStatus.PAID ||
        existingOrder.status === MarketplaceOrderStatus.EMAILED)
    ) {
      return {
        orderNumber: existingOrder.orderNumber,
        status: existingOrder.status,
        paymentStatus: 'CONFIRMED' as const,
      };
    }

    const session =
      await this.repo.findOnlineCheckoutSessionByClientTxId(clientTxId);
    if (session) {
      return this.confirmCardPaymentFromSession(dto, session, clientTxId);
    }

    return this.confirmCardPaymentLegacyOrder(dto, clientTxId);
  }

  private async confirmCardPaymentFromSession(
    dto: ConfirmPayphonePaymentDto,
    session: NonNullable<
      Awaited<ReturnType<typeof this.repo.findOnlineCheckoutSessionByClientTxId>>
    >,
    clientTxId: string,
  ) {
    if (session.clientTransactionId !== clientTxId) {
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
      throw new BadRequestException({
        message: 'Payment was not approved',
        details: {
          transactionStatus: confirm.transactionStatus,
          reason,
          chooseAnotherPaymentMethod: true,
        },
      });
    }

    const expectedAmount = session.totalCents || session.subtotalCents;
    if (
      typeof confirm.amount === 'number' &&
      confirm.amount > 0 &&
      confirm.amount !== expectedAmount
    ) {
      throw new BadRequestException({
        message: 'Payment amount mismatch',
        details: { chooseAnotherPaymentMethod: true },
      });
    }

    if (
      confirm.currency &&
      confirm.currency.toUpperCase() !== session.currency.toUpperCase()
    ) {
      throw new BadRequestException({
        message: 'Payment currency mismatch',
        details: { chooseAnotherPaymentMethod: true },
      });
    }

    let paid;
    try {
      paid = await this.repo.finalizeOnlineCheckoutSession({
        sessionId: session.id,
        payphoneClientTxId: clientTxId,
        cardPayment: {
          payphoneId: dto.payphoneId,
          authorizationCode: confirm.authorizationCode ?? null,
          transactionId:
            confirm.transactionId != null
              ? String(confirm.transactionId)
              : null,
          rawResponse: confirm as unknown as Prisma.InputJsonValue,
          amountCents: session.totalCents,
          taxCents: session.taxCents,
        },
      });
    } catch (err) {
      this.rethrowOrderPlacementError(err);
    }

    const settings = await this.repo.getSettings();
    const emailed = await this.sendOrderEmails(
      {
        ...paid,
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

  /** Legacy unpaid CARD orders created before checkout sessions. */
  private async confirmCardPaymentLegacyOrder(
    dto: ConfirmPayphonePaymentDto,
    clientTxId: string,
  ) {
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

    const confirm = await this.payphone.confirmTransaction(
      dto.payphoneId,
      clientTxId,
    );
    if (!this.payphone.isApproved(confirm)) {
      throw new BadRequestException('Payment was not approved');
    }

    await this.repo.decrementStockForOrder(order.id);
    if (paymentRow) {
      await this.repo.updatePayment(paymentRow.id, {
        status: 'CONFIRMED',
        payphoneId: dto.payphoneId,
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
      paid,
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
    checkoutReference: string,
    dto: CapturePayPalOrderDto,
  ) {
    const existingOrder = await this.repo.findOrderByNumber(checkoutReference);
    if (
      existingOrder &&
      (existingOrder.status === MarketplaceOrderStatus.PAID ||
        existingOrder.status === MarketplaceOrderStatus.EMAILED)
    ) {
      return existingOrder;
    }

    const session =
      await this.repo.findOnlineCheckoutSessionByPlannedOrderNumber(
        checkoutReference,
      );
    if (session) {
      return this.capturePayPalOrderFromSession(session, dto);
    }

    if (!existingOrder) {
      throw new NotFoundException('Checkout session or order not found');
    }

    return this.capturePayPalOrderLegacy(existingOrder, dto);
  }

  private async capturePayPalOrderFromSession(
    session: NonNullable<
      Awaited<
        ReturnType<typeof this.repo.findOnlineCheckoutSessionByPlannedOrderNumber>
      >
    >,
    dto: CapturePayPalOrderDto,
  ) {
    if (session.paymentMethod !== MarketplacePaymentMethod.PAYPAL) {
      throw new BadRequestException('Not a PayPal checkout session');
    }
    if (session.paypalOrderId && session.paypalOrderId !== dto.paypalOrderId) {
      throw new BadRequestException('PayPal order id mismatch');
    }

    if (
      this.paypal.getProviderMode() === 'mock' &&
      dto.sig &&
      !this.paypal.verifyMockSignature(
        dto.paypalOrderId,
        session.plannedOrderNumber,
        dto.sig,
      )
    ) {
      throw new BadRequestException('Invalid mock payment signature');
    }

    const capture = await this.paypal.captureOrder(dto.paypalOrderId);
    if (capture.status !== 'COMPLETED') {
      throw new BadRequestException('PayPal capture failed');
    }

    if (
      capture.amountCents > 0 &&
      capture.amountCents !== session.subtotalCents
    ) {
      this.logger.warn(
        `PayPal amount mismatch for ${session.plannedOrderNumber}: expected ${session.subtotalCents}, got ${capture.amountCents}`,
      );
    }

    let paid;
    try {
      paid = await this.repo.finalizeOnlineCheckoutSession({
        sessionId: session.id,
        paypalCaptureId: capture.captureId,
      });
    } catch (err) {
      this.rethrowOrderPlacementError(err);
    }

    const settings = await this.repo.getSettings();
    return this.sendOrderEmails(
      paid,
      settings,
      MarketplaceOrderStatus.PAID,
      MarketplaceOrderStatus.PAID,
      true,
    );
  }

  /** Legacy PayPal orders created before checkout sessions. */
  private async capturePayPalOrderLegacy(
    order: NonNullable<Awaited<ReturnType<typeof this.repo.findOrderByNumber>>>,
    dto: CapturePayPalOrderDto,
  ) {
    if (order.status !== MarketplaceOrderStatus.AWAITING_PAYMENT) {
      throw new BadRequestException('Order is not awaiting payment');
    }
    if (order.paypalOrderId && order.paypalOrderId !== dto.paypalOrderId) {
      throw new BadRequestException('PayPal order id mismatch');
    }

    await this.repo.decrementStockForOrder(order.id);
    const capture = await this.paypal.captureOrder(dto.paypalOrderId);
    if (capture.status !== 'COMPLETED') {
      await this.repo.restockOrderItems(order.id).catch(() => undefined);
      throw new BadRequestException('PayPal capture failed');
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
    // PayPal / Payphone: never email or WhatsApp until payment confirmed.
    if (this.isOnlinePaymentMethod(order.paymentMethod) && !paymentConfirmed) {
      this.logger.warn(
        `Skipping email/WhatsApp for unpaid online order ${order.orderNumber} (${order.paymentMethod})`,
      );
      const existing = await this.repo.findOrderById(order.id);
      return existing ?? (order as Awaited<ReturnType<typeof this.repo.updateOrder>>);
    }

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

    const emailKind = paymentConfirmed
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
      emailKind,
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

    // PayPal / Payphone: no "pedido en proceso" WhatsApp until paid.
    if (
      this.isOnlinePaymentMethod(args.order.paymentMethod) &&
      args.phase !== 'paid'
    ) {
      return;
    }

    try {
      if (args.phase === 'awaiting') {
        // EMAIL / BANK_TRANSFER only: admin + customer how-to-proceed.
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

      // Paid (PayPal / Payphone / offline confirm): customer paid notice.
      // Admin already got store email (ORDER_PAID) from sendOrderEmails.
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
    const wasPaid = this.orderRequiresRestockOnCancel(order);
    const cancelled = wasPaid
      ? await this.repo.restockOrderItems(id)
      : await this.repo.cancelOrderSoft(id);
    if (!cancelled) {
      throw new NotFoundException('Order not found');
    }
    await this.notifyOrderCancelled(cancelled, wasPaid);
    return cancelled;
  }

  private async notifyOrderCancelled(
    order: Awaited<ReturnType<typeof this.repo.findOrderById>>,
    wasPaid: boolean,
  ): Promise<void> {
    if (!order) return;

    const settings = await this.repo.getSettings();
    const frontendBase = (
      this.config.get<string>('frontendUrl') ?? 'http://localhost:4200'
    ).replace(/\/$/, '');
    const orderConfirmationUrl = `${frontendBase}/tienda/pedido/${encodeURIComponent(order.orderNumber)}`;

    const emailPayload = {
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
      fromName: settings.fromName,
      orderConfirmationUrl,
      wasPaid,
      items: order.items.map((i) => ({
        name: i.name,
        sku: i.sku,
        qty: i.qty,
        listUnitPriceCents: i.listUnitPriceCents,
        discountPercent: i.discountPercent,
        promoDiscountPercent: i.promoDiscountPercent,
        unitPriceCents: i.unitPriceCents,
      })),
    };

    try {
      await this.mail.sendMarketplaceOrderCancelledToCustomer({
        ...emailPayload,
        to: order.customerEmail.trim(),
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Cancellation email failed for ${order.orderNumber}: ${reason}`,
      );
    }

    try {
      await this.whatsapp.notifyCustomerOrderCancelled(
        {
          id: order.id,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          subtotalCents: order.subtotalCents,
          currency: order.currency,
          paymentMethod: order.paymentMethod,
          notifyWhatsapp: order.notifyWhatsapp,
        },
        { confirmationUrl: orderConfirmationUrl, wasPaid },
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Cancellation WhatsApp failed for ${order.orderNumber}: ${reason}`,
      );
    }
  }

  /** Restock only when stock was actually decremented for this order. */
  private orderRequiresRestockOnCancel(order: {
    status: MarketplaceOrderStatus;
    paidAt: Date | null;
    paymentMethod: MarketplacePaymentMethod;
  }): boolean {
    if (order.paidAt) return true;
    if (order.status === MarketplaceOrderStatus.PAID) return true;
    // Legacy email checkout reserved stock at placement (PENDING, no paidAt).
    if (
      order.status === MarketplaceOrderStatus.PENDING &&
      order.paymentMethod === MarketplacePaymentMethod.EMAIL
    ) {
      return true;
    }
    return false;
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
