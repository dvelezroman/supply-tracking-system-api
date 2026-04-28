import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LotsService } from '../lots/lots.service';
import { QrService } from '../../common/services/qr.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildPublicTracePayload,
  resolveVisibility,
} from '../../common/public-visibility/public-visibility';

@Injectable()
export class PublicTraceService {
  constructor(
    private readonly lotsService: LotsService,
    private readonly qrService: QrService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async getPublicTraceByRestaurantSlug(slug: string) {
    const normalized = slug.trim().toLowerCase();
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { slug: normalized },
    });
    if (!restaurant) {
      throw new NotFoundException(`Restaurant '${slug}' not found`);
    }

    const link = await this.prisma.lotRestaurant.findFirst({
      where: { restaurantId: restaurant.id },
      orderBy: { createdAt: 'desc' },
    });
    if (!link) {
      throw new NotFoundException(
        'No supply lot linked for this restaurant yet',
      );
    }

    const lotRow = await this.prisma.lot.findUnique({
      where: { id: link.lotId },
      select: { lotCode: true },
    });
    if (!lotRow) {
      throw new NotFoundException('Linked lot not found');
    }

    const base = await this.getPublicTrace(lotRow.lotCode);
    return {
      ...base,
      restaurant: {
        name: restaurant.name,
        slug: restaurant.slug,
      },
    };
  }

  async getPublicTrace(lotCode: string) {
    const { lot, events } = await this.lotsService.getHistory(lotCode);

    const frontendUrl =
      this.configService.get<string>('frontendUrl') ?? 'http://localhost:4200';
    const traceUrlFallback =
      lot.publicTraceUrl ??
      `${frontendUrl}/trace/${encodeURIComponent(lotCode)}`;

    const vis = resolveVisibility(lot.publicVisibility);
    const { lot: filteredLot, events: filteredEvents } = buildPublicTracePayload(
      lot,
      events,
      vis,
    );

    const traceUrl = vis.showPublicQrBlock ? traceUrlFallback : null;
    const qrDataUrl = vis.showPublicQrBlock
      ? lot.qrCodeDataUrl ?? (await this.qrService.generateDataUrl(traceUrlFallback))
      : null;

    return {
      lot: {
        ...filteredLot,
        harvestDate: filteredLot.harvestDate?.toISOString() ?? null,
      },
      events: filteredEvents.map((e) => ({
        ...e,
        timestamp: e.timestamp.toISOString(),
      })),
      qrCode: qrDataUrl,
      traceUrl,
      generatedAt: new Date().toISOString(),
    };
  }
}
