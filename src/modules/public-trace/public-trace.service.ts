import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventType } from '@prisma/client';
import { LotsService } from '../lots/lots.service';
import { LotAvailabilityService } from '../lots/lot-availability.service';
import { metadataRestaurantId } from '../lots/lot-availability';
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
    private readonly lotAvailabilityService: LotAvailabilityService,
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

    const base = await this.buildPublicTraceResponse(lotRow.lotCode, {
      mode: 'restaurant',
      restaurantId: restaurant.id,
    });
    return {
      ...base,
      restaurant: {
        name: restaurant.name,
        slug: restaurant.slug,
      },
    };
  }

  async getPublicTrace(lotCode: string) {
    return this.buildPublicTraceResponse(lotCode, { mode: 'lot-package' });
  }

  private async buildPublicTraceResponse(
    lotCode: string,
    payloadMode:
      | { mode: 'lot-package' }
      | { mode: 'restaurant'; restaurantId: string },
  ) {
    const { lot, events } = await this.lotsService.getHistory(lotCode);

    const frontendUrl =
      this.configService.get<string>('frontendUrl') ?? 'http://localhost:4200';
    const traceUrlFallback =
      lot.publicTraceUrl ??
      `${frontendUrl}/trace/${encodeURIComponent(lotCode)}`;

    const vis = resolveVisibility(lot.publicVisibility);
    const deliveryTotals =
      payloadMode.mode === 'lot-package'
        ? await this.lotAvailabilityService.computeAvailability(lot.id)
        : undefined;

    const buildOpts =
      payloadMode.mode === 'lot-package'
        ? { mode: 'lot-package' as const, deliveryTotals }
        : {
            mode: 'restaurant' as const,
            restaurantId: payloadMode.restaurantId,
          };

    const { lot: filteredLot, events: filteredEvents } = buildPublicTracePayload(
      lot,
      events,
      vis,
      buildOpts,
    );

    const traceUrl = vis.showPublicQrBlock ? traceUrlFallback : null;
    const qrDataUrl = vis.showPublicQrBlock
      ? lot.qrCodeDataUrl ?? (await this.qrService.generateDataUrl(traceUrlFallback))
      : null;

    const restaurantDeliveryPending =
      payloadMode.mode === 'restaurant'
        ? !events.some(
            (e) =>
              e.eventType === EventType.DELIVERED &&
              metadataRestaurantId(e.metadata) === payloadMode.restaurantId,
          )
        : undefined;

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
      ...(restaurantDeliveryPending !== undefined
        ? { restaurantDeliveryPending }
        : {}),
    };
  }
}
