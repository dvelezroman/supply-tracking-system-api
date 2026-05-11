import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  computeAvailabilityFromParts,
  computeInitialInventory,
  parseDeliveredLine,
  roundKg,
  sumDeliveredLines,
  type LotAvailabilityComputed,
} from './lot-availability';

export type { LotAvailabilityComputed };

@Injectable()
export class LotAvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async computeAvailability(lotId: string): Promise<LotAvailabilityComputed> {
    const lot = await this.prisma.lot.findUnique({
      where: { id: lotId },
      select: { lotSizeLbs: true, weightKg: true },
    });
    if (!lot) throw new NotFoundException('Lot not found');

    const delivered = await this.prisma.traceabilityEvent.findMany({
      where: {
        lotId,
        deletedAt: null,
        eventType: EventType.DELIVERED,
      },
      select: { metadata: true },
    });

    return computeAvailabilityFromParts(lot, delivered);
  }

  /**
   * Validates a DELIVERED payload: requires parsable quantity and/or deliveredWeightKg,
   * and ensures cumulative kg delivered does not exceed lot mass from `lotSizeLbs`.
   */
  async assertDeliveredWithinCapacity(
    lotId: string,
    metadata: Record<string, unknown> | undefined | null,
    opts?: { excludeEventId?: string },
  ): Promise<void> {
    const lot = await this.prisma.lot.findUnique({
      where: { id: lotId },
      select: { lotSizeLbs: true, weightKg: true },
    });
    if (!lot) throw new NotFoundException('Lot not found');

    const line = parseDeliveredLine(metadata, lot.weightKg);
    if (!line) {
      throw new BadRequestException(
        'Los eventos DELIVERED requieren metadata.quantity (cajas) y/o metadata.deliveredWeightKg (kg entregados).',
      );
    }

    const others = await this.prisma.traceabilityEvent.findMany({
      where: {
        lotId,
        deletedAt: null,
        eventType: EventType.DELIVERED,
        ...(opts?.excludeEventId ? { id: { not: opts.excludeEventId } } : {}),
      },
      select: { metadata: true },
    });

    const prev = sumDeliveredLines(others, lot.weightKg);
    const { initialWeightKg } = computeInitialInventory(lot);

    if (prev.totalKg + line.kg > initialWeightKg + 1e-4) {
      throw new BadRequestException(
        `La entrega excede el peso disponible del lote: máximo acumulado ${roundKg(initialWeightKg)} kg; ya constan ${roundKg(prev.totalKg)} kg entregados.`,
      );
    }
  }
}
