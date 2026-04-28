import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RestaurantsRepository } from './restaurants.repository';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { RestaurantQueryDto } from './dto/restaurant-query.dto';
import { QrService } from '../../common/services/qr.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class RestaurantsService {
  constructor(
    private readonly restaurantsRepository: RestaurantsRepository,
    private readonly qrService: QrService,
    private readonly configService: ConfigService,
  ) {}

  private buildPublicMenuTraceUrl(slug: string): string {
    const base =
      this.configService.get<string>('frontendUrl') ?? 'http://localhost:4200';
    const trimmed = base.replace(/\/$/, '');
    return `${trimmed}/trace/restaurant/${encodeURIComponent(slug)}`;
  }

  /**
   * Omits huge PNG data URLs from list payloads (same concern as lot list).
   */
  private stripMenuQrForList<T extends { menuQrCodeDataUrl?: string }>(
    row: T,
  ): Omit<T, 'menuQrCodeDataUrl'> {
    const { menuQrCodeDataUrl: _drop, ...rest } = row;
    return rest;
  }

  async create(dto: CreateRestaurantDto) {
    const slug = dto.slug.trim().toLowerCase();
    const existing = await this.restaurantsRepository.findBySlug(slug);
    if (existing) {
      throw new ConflictException(`Restaurant slug '${slug}' is already in use`);
    }

    const publicMenuTraceUrl = this.buildPublicMenuTraceUrl(slug);
    let menuQrCodeDataUrl: string;
    try {
      menuQrCodeDataUrl = await this.qrService.generateDataUrl(publicMenuTraceUrl);
    } catch {
      throw new BadRequestException('Failed to generate menu QR code');
    }

    return this.restaurantsRepository.create({
      name: dto.name.trim(),
      slug,
      location: dto.location?.trim() || undefined,
      contact: dto.contact?.trim() || undefined,
      publicMenuTraceUrl,
      menuQrCodeDataUrl,
    });
  }

  async findById(id: string) {
    const row = await this.restaurantsRepository.findById(id);
    if (!row) throw new NotFoundException('Restaurant not found');
    return row;
  }

  async findAll(query: RestaurantQueryDto) {
    const p = Math.max(1, Number(query.page) || 1);
    const l = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (p - 1) * l;

    const search = query.search?.trim();
    const where: Prisma.RestaurantWhereInput | undefined = search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { slug: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined;

    const [rows, total] = await Promise.all([
      this.restaurantsRepository.findAll({ skip, take: l, where }),
      this.restaurantsRepository.count(where),
    ]);
    const items = rows.map((r) => this.stripMenuQrForList(r));
    return { items, total, page: p, limit: l };
  }

  async update(id: string, dto: UpdateRestaurantDto) {
    const current = await this.findById(id);

    let slug = current.slug;
    if (dto.slug !== undefined) {
      slug = dto.slug.trim().toLowerCase();
      if (slug !== current.slug) {
        const taken = await this.restaurantsRepository.findBySlug(slug);
        if (taken && taken.id !== id) {
          throw new ConflictException(`Restaurant slug '${slug}' is already in use`);
        }
      }
    }

    const name =
      dto.name !== undefined ? dto.name.trim() : undefined;
    const location =
      dto.location !== undefined ? dto.location?.trim() || null : undefined;
    const contact =
      dto.contact !== undefined ? dto.contact?.trim() || null : undefined;

    const slugChanged = dto.slug !== undefined && slug !== current.slug;
    let publicMenuTraceUrl: string | undefined;
    let menuQrCodeDataUrl: string | undefined;
    if (slugChanged) {
      publicMenuTraceUrl = this.buildPublicMenuTraceUrl(slug);
      try {
        menuQrCodeDataUrl = await this.qrService.generateDataUrl(publicMenuTraceUrl);
      } catch {
        throw new BadRequestException('Failed to regenerate menu QR code');
      }
    }

    return this.restaurantsRepository.update(id, {
      ...(name !== undefined && { name }),
      ...(dto.slug !== undefined && { slug }),
      ...(location !== undefined && { location }),
      ...(contact !== undefined && { contact }),
      ...(slugChanged && publicMenuTraceUrl && menuQrCodeDataUrl
        ? { publicMenuTraceUrl, menuQrCodeDataUrl }
        : {}),
    });
  }

  async remove(id: string) {
    await this.findById(id);
    return this.restaurantsRepository.delete(id);
  }
}
