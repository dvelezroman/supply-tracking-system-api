import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketplaceOrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { StorageService } from '../storage/storage.service';
import { CreateMarketplaceOrderDto } from './dto/create-order.dto';
import {
  CreateMarketplaceProductDto,
  UpdateMarketplaceProductDto,
  UpdateMarketplaceSettingsDto,
} from './dto/marketplace.dto';
import { MarketplaceRepository } from './marketplace.repository';

@Injectable()
export class MarketplaceService {
  private readonly logger = new Logger(MarketplaceService.name);

  constructor(
    private readonly repo: MarketplaceRepository,
    private readonly storage: StorageService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

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
      await this.storage.delete(img.key).catch(() => undefined);
    }
    return this.repo.deleteProduct(id);
  }

  async uploadImage(
    productId: string,
    file: Express.Multer.File,
    isPrimary?: boolean,
  ) {
    await this.findProductById(productId);
    if (!file?.buffer?.length) {
      throw new BadRequestException('Image file is required');
    }
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.mimetype)) {
      throw new BadRequestException('Only JPEG, PNG, WebP or GIF images are allowed');
    }

    const uploaded = await this.storage.upload(
      file.buffer,
      file.mimetype,
      file.originalname,
    );

    if (isPrimary) {
      await this.repo.clearPrimaryImages(productId);
    }

    const product = await this.findProductById(productId);
    const makePrimary = isPrimary || product.images.length === 0;

    return this.repo.createImage({
      product: { connect: { id: productId } },
      url: uploaded.url,
      key: uploaded.key,
      sortOrder: product.images.length,
      isPrimary: makePrimary,
    });
  }

  async deleteImage(productId: string, imageId: string) {
    await this.findProductById(productId);
    const image = await this.repo.findImageById(imageId);
    if (!image || image.productId !== productId) {
      throw new NotFoundException('Image not found');
    }
    await this.storage.delete(image.key).catch(() => undefined);
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

  async getPublicSettings() {
    const s = await this.repo.getSettings();
    return { storeEnabled: s.storeEnabled };
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
    if (dto.fromName !== undefined) {
      data.fromName = dto.fromName?.trim() || null;
    }
    return this.repo.updateSettings(data);
  }

  // ─── Orders ───────────────────────────────────────────────────────────────

  async placeOrder(dto: CreateMarketplaceOrderDto) {
    const settings = await this.repo.getSettings();
    if (!settings.storeEnabled) {
      throw new BadRequestException('Store is currently disabled');
    }

    const orderNumber = this.generateOrderNumber();
    let order;
    try {
      order = await this.repo.placeOrder({
        orderNumber,
        customerName: dto.customerName.trim(),
        customerEmail: dto.customerEmail.trim().toLowerCase(),
        customerPhone: dto.customerPhone?.trim(),
        customerAddress: dto.customerAddress?.trim(),
        notes: dto.notes?.trim(),
        currency: 'USD',
        lines: dto.items.map((i) => ({
          productId: i.productId,
          name: '',
          sku: '',
          unitPriceCents: 0,
          qty: i.qty,
        })),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.startsWith('STOCK:')) {
        const [, productId, available, name] = msg.split(':');
        throw new HttpException(
          {
            message: 'Insufficient stock',
            details: [
              {
                productId,
                available: Number(available),
                name,
              },
            ],
          },
          HttpStatus.CONFLICT,
        );
      }
      if (msg.startsWith('UNAVAILABLE:')) {
        throw new BadRequestException('One or more products are unavailable');
      }
      throw err;
    }

    const to =
      settings.orderNotificationEmail?.trim() ||
      this.config.get<string>('contactEmail')?.trim() ||
      '';

    if (!to) {
      const updated = await this.repo.updateOrder(order.id, {
        emailError: 'No order notification email configured',
      });
      return updated;
    }

    try {
      await this.mail.sendMarketplaceOrder({
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        customerPhone: order.customerPhone,
        customerAddress: order.customerAddress,
        notes: order.notes,
        subtotalCents: order.subtotalCents,
        currency: order.currency,
        items: order.items.map((i) => ({
          name: i.name,
          sku: i.sku,
          qty: i.qty,
          unitPriceCents: i.unitPriceCents,
        })),
        to,
        fromName: settings.fromName,
      });
      return this.repo.updateOrder(order.id, {
        status: MarketplaceOrderStatus.EMAILED,
        emailError: null,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Email send failed';
      this.logger.error(`Order email failed for ${order.orderNumber}: ${reason}`);
      return this.repo.updateOrder(order.id, {
        status: MarketplaceOrderStatus.PENDING,
        emailError: reason,
      });
    }
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
    return {
      orderNumber: order.orderNumber,
      status: order.status,
      customerName: order.customerName,
      subtotalCents: order.subtotalCents,
      currency: order.currency,
      items: order.items.map((i) => ({
        name: i.name,
        sku: i.sku,
        qty: i.qty,
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
}
