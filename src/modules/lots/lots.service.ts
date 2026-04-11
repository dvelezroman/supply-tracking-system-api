import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
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

@Injectable()
export class LotsService {
  constructor(
    private readonly lotsRepository: LotsRepository,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly qrService: QrService,
  ) {}

  private buildPublicTraceUrl(lotCode: string): string {
    const base =
      this.configService.get<string>('frontendUrl') ?? 'http://localhost:4200';
    const trimmed = base.replace(/\/$/, '');
    return `${trimmed}/trace/${encodeURIComponent(lotCode)}`;
  }

  async create(dto: CreateLotDto) {
    const existing = await this.lotsRepository.findByLotCode(dto.lotCode);
    if (existing) {
      throw new ConflictException(`Lot code '${dto.lotCode}' already exists`);
    }

    const { productId, farmId, labId, maturationId, coPackerId, harvestDate, ...rest } =
      dto;

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { publicVisibilityDefaults: true },
    });
    const publicVisibility = resolveVisibility(product?.publicVisibilityDefaults);

    const publicTraceUrl = this.buildPublicTraceUrl(dto.lotCode);
    const qrCodeDataUrl = await this.qrService.generateDataUrl(publicTraceUrl);

    return this.lotsRepository.create({
      ...rest,
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
    return lot;
  }

  async findByLotCode(lotCode: string) {
    const lot = await this.lotsRepository.findByLotCode(lotCode);
    if (!lot) throw new NotFoundException(`Lot '${lotCode}' not found`);
    return lot;
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
