import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { Prisma, Presentation, Packaging } from '@prisma/client';
import { LotsRepository } from './lots.repository';
import { CreateLotDto } from './dto/create-lot.dto';
import { UpdateLotDto } from './dto/update-lot.dto';
import type { LotListQueryDto } from './dto/lot-list-query.dto';
import { QrService } from '../../common/services/qr.service';
import {
  isPublicVisibilityKey,
  mergeVisibilityPatch,
  resolveVisibility,
} from '../../common/public-visibility/public-visibility';
import {
  buildLotCodeBase,
  nextLotCodeForProduct,
} from './lot-code.generator';
import type { SuggestLotCodeQueryDto } from './dto/suggest-lot-code.query.dto';
import { LotAvailabilityService } from './lot-availability.service';

@Injectable()
export class LotsService {
  constructor(
    private readonly lotsRepository: LotsRepository,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly qrService: QrService,
    private readonly lotAvailabilityService: LotAvailabilityService,
  ) {}

  async addRestaurantToLot(lotId: string, restaurantId: string) {
    await this.findById(lotId);
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });
    if (!restaurant) throw new NotFoundException('Restaurant not found');
    return this.prisma.lotRestaurant.create({
      data: { lotId, restaurantId },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            slug: true,
            publicMenuTraceUrl: true,
            menuQrCodeDataUrl: true,
          },
        },
      },
    });
  }

  async listRestaurantsOnLot(lotId: string) {
    await this.findById(lotId);
    return this.prisma.lotRestaurant.findMany({
      where: { lotId },
      orderBy: { createdAt: 'desc' },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            slug: true,
            publicMenuTraceUrl: true,
            menuQrCodeDataUrl: true,
          },
        },
      },
    });
  }

  async removeRestaurantFromLot(lotId: string, restaurantId: string) {
    await this.findById(lotId);
    const result = await this.prisma.lotRestaurant.deleteMany({
      where: { lotId, restaurantId },
    });
    if (result.count === 0) {
      throw new NotFoundException('This restaurant is not linked to this lot');
    }
    return { deleted: result.count };
  }

  private buildPublicTraceUrl(lotCode: string): string {
    const base =
      this.configService.get<string>('frontendUrl') ?? 'http://localhost:4200';
    const trimmed = base.replace(/\/$/, '');
    return `${trimmed}/trace/${encodeURIComponent(lotCode)}`;
  }

  async suggestNextLotCode(query: SuggestLotCodeQueryDto): Promise<{ lotCode: string }> {
    const product = await this.prisma.product.findUnique({
      where: { id: query.productId },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const lotCode = await this.resolveNextLotCodeForProduct(query);
    return { lotCode };
  }

  private async resolveNextLotCodeForProduct(params: {
    productId: string;
    poolNumber: number;
    harvestDate: string;
    presentation: Presentation;
    packaging: Packaging;
  }): Promise<string> {
    const base = buildLotCodeBase(
      params.poolNumber,
      params.harvestDate,
      params.presentation,
      params.packaging,
    );
    const rows = await this.lotsRepository.findLotCodesByProductAndBase(
      params.productId,
      base,
    );
    const codes = rows.map((r) => r.lotCode);
    return nextLotCodeForProduct(base, codes);
  }

  async create(dto: CreateLotDto) {
    const trimmedCode = dto.lotCode?.trim();
    const lotCode =
      trimmedCode ||
      (await this.resolveNextLotCodeForProduct({
        productId: dto.productId,
        poolNumber: dto.poolNumber,
        harvestDate: dto.harvestDate,
        presentation: dto.presentation,
        packaging: dto.packaging,
      }));

    const existing = await this.lotsRepository.findByLotCode(lotCode);
    if (existing) {
      throw new ConflictException(`Lot code '${lotCode}' already exists`);
    }

    const {
      productId,
      farmId,
      labId,
      maturationId,
      coPackerId,
      harvestDate,
      lotCode: _dtoLotCode,
      ...rest
    } = dto;

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { publicVisibilityDefaults: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    const publicVisibility = resolveVisibility(product?.publicVisibilityDefaults);

    const publicTraceUrl = this.buildPublicTraceUrl(lotCode);
    const qrCodeDataUrl = await this.qrService.generateDataUrl(publicTraceUrl);

    return this.lotsRepository.create({
      ...rest,
      lotCode,
      harvestDate: new Date(harvestDate),
      publicTraceUrl,
      qrCodeDataUrl,
      publicVisibility: publicVisibility as unknown as Prisma.InputJsonValue,
      product: { connect: { id: productId } },
      farm: { connect: { id: farmId } },
      lab: { connect: { id: labId } },
      maturation: { connect: { id: maturationId } },
      coPacker: { connect: { id: coPackerId } },
    });
  }

  async findById(id: string) {
    const lot = await this.lotsRepository.findById(id);
    if (!lot) throw new NotFoundException('Lot not found');
    const availability = await this.lotAvailabilityService.computeAvailability(id);
    return { ...lot, availability };
  }

  async findByLotCode(lotCode: string) {
    const lot = await this.lotsRepository.findByLotCode(lotCode);
    if (!lot) throw new NotFoundException(`Lot '${lotCode}' not found`);
    const availability = await this.lotAvailabilityService.computeAvailability(lot.id);
    return { ...lot, availability };
  }

  /**
   * List payloads must not embed `qrCodeDataUrl` (full PNG as data URL per row) — it breaks
   * JSON size and the Angular table. QR is loaded from `GET .../lots/code/:lotCode/qr` or detail.
   */
  private stripQrDataUrlForList<T extends { qrCodeDataUrl?: string | null }>(lot: T): Omit<T, 'qrCodeDataUrl'> {
    const { qrCodeDataUrl: _drop, ...rest } = lot;
    return rest;
  }

  private buildLotListWhere(query: LotListQueryDto): Prisma.LotWhereInput | undefined {
    const conditions: Prisma.LotWhereInput[] = [];

    if (query.productId) {
      conditions.push({ productId: query.productId });
    }

    const search = query.search?.trim();
    if (search) {
      conditions.push({
        OR: [
          { lotCode: { contains: search, mode: 'insensitive' } },
          { product: { name: { contains: search, mode: 'insensitive' } } },
          { product: { sku: { contains: search, mode: 'insensitive' } } },
        ],
      });
    }

    if (query.harvestFrom || query.harvestTo) {
      const harvestDate: Prisma.DateTimeFilter = {};
      if (query.harvestFrom) {
        harvestDate.gte = new Date(`${query.harvestFrom}T00:00:00.000Z`);
      }
      if (query.harvestTo) {
        harvestDate.lte = new Date(`${query.harvestTo}T23:59:59.999Z`);
      }
      conditions.push({ harvestDate });
    }

    if (!conditions.length) return undefined;
    return { AND: conditions };
  }

  async findAll(query: LotListQueryDto) {
    if (query.harvestFrom && query.harvestTo && query.harvestFrom > query.harvestTo) {
      throw new BadRequestException('harvestFrom must be on or before harvestTo');
    }

    const p = Math.max(1, Number(query.page) || 1);
    const l = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (p - 1) * l;
    const where = this.buildLotListWhere(query);
    const [rows, total] = await Promise.all([
      this.lotsRepository.findAll({ skip, take: l, where }),
      this.lotsRepository.count(where),
    ]);
    const items = rows.map((lot) => this.stripQrDataUrlForList(lot));
    return { items, total, page: p, limit: l };
  }

  async update(id: string, dto: UpdateLotDto) {
    await this.findById(id);
    const { farmId, labId, maturationId, coPackerId, harvestDate, ...rest } = dto as any;

    return this.lotsRepository.update(id, {
      ...rest,
      ...(harvestDate && { harvestDate: new Date(harvestDate) }),
      ...(farmId       && { farm:       { connect: { id: farmId } } }),
      ...(labId        && { lab:        { connect: { id: labId } } }),
      ...(maturationId && { maturation: { connect: { id: maturationId } } }),
      ...(coPackerId   && { coPacker:   { connect: { id: coPackerId } } }),
    });
  }

  /**
   * Hard-deletes all traceability events for the lot (including those soft-deleted
   * per-event), then deletes restaurants linked only to this lot, then the lot.
   * Restaurants that still supply other lots are kept; their link to this lot is removed
   * on lot delete (DB cascade). Events must be removed before the lot (FK not CASCADE).
   */
  async remove(id: string) {
    await this.findById(id);

    const linked = await this.prisma.lotRestaurant.findMany({
      where: { lotId: id },
      select: { restaurantId: true },
    });
    const restaurantIds = [...new Set(linked.map((l) => l.restaurantId))];

    let orphanRestaurantIds: string[] = [];
    if (restaurantIds.length > 0) {
      const otherLinks = await this.prisma.lotRestaurant.findMany({
        where: {
          lotId: { not: id },
          restaurantId: { in: restaurantIds },
        },
        select: { restaurantId: true },
      });
      const withOtherLots = new Set(otherLinks.map((l) => l.restaurantId));
      orphanRestaurantIds = restaurantIds.filter((rid) => !withOtherLots.has(rid));
    }

    await this.prisma.$transaction(async (tx) => {
      // Hard-delete all traceability rows for this lot (including soft-deleted events:
      // `deleteMany` does not filter on `deletedAt`; single-event deletes only set deletedAt).
      await tx.traceabilityEvent.deleteMany({ where: { lotId: id } });
      if (orphanRestaurantIds.length > 0) {
        await tx.restaurant.deleteMany({
          where: { id: { in: orphanRestaurantIds } },
        });
      }
      await tx.lot.delete({ where: { id } });
    });
    return { id };
  }

  async getHistory(lotCode: string) {
    const lot = await this.findByLotCode(lotCode);
    const events = await this.lotsRepository.findHistory(lot.id);
    return { lot, events };
  }

  assertVisibilityPatch(patch: Record<string, boolean>): void {
    for (const [k, v] of Object.entries(patch)) {
      if (!isPublicVisibilityKey(k)) {
        throw new BadRequestException(`Unknown visibility key: ${k}`);
      }
      if (typeof v !== 'boolean') {
        throw new BadRequestException(`Invalid value for ${k}`);
      }
    }
  }

  async updatePublicVisibility(id: string, patch: Record<string, boolean>) {
    this.assertVisibilityPatch(patch);
    const row = await this.prisma.lot.findUnique({
      where: { id },
      select: { publicVisibility: true },
    });
    if (!row) throw new NotFoundException('Lot not found');
    const merged = mergeVisibilityPatch(row.publicVisibility, patch);
    return this.lotsRepository.update(id, {
      publicVisibility: merged as unknown as Prisma.InputJsonValue,
    });
  }
}
