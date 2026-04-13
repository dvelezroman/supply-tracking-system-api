import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TraceabilityRepository } from './traceability.repository';
import { CreateEventDto } from './dto/create-event.dto';
import { ListEventsQueryDto } from './dto/list-events-query.dto';
import { LotsService } from '../lots/lots.service';
import { ActorsService } from '../actors/actors.service';
import { ProductsService } from '../products/products.service';

@Injectable()
export class TraceabilityService {
  constructor(
    private readonly traceabilityRepository: TraceabilityRepository,
    private readonly lotsService: LotsService,
    private readonly actorsService: ActorsService,
    private readonly productsService: ProductsService,
  ) {}

  async recordEvent(dto: CreateEventDto) {
    // Validate lot and actor exist before writing the event
    await Promise.all([
      this.lotsService.findById(dto.lotId),
      this.actorsService.findById(dto.actorId),
    ]);

    const { lotId, actorId, ...rest } = dto;
    const created = await this.traceabilityRepository.create({
      ...rest,
      lot: { connect: { id: lotId } },
      actor: { connect: { id: actorId } },
    });
    return this.mapEventRow(created);
  }

  async findAll(query: ListEventsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    this.assertRangeOrder(query.dateFrom, query.dateTo, 'dateFrom', 'dateTo');
    this.assertRangeOrder(
      query.harvestDateFrom,
      query.harvestDateTo,
      'harvestDateFrom',
      'harvestDateTo',
    );

    const where = this.buildEventWhere(query);
    const [raw, total] = await Promise.all([
      this.traceabilityRepository.findAll({ skip, take: limit, where }),
      this.traceabilityRepository.count(where),
    ]);
    const items = raw.map((e) => this.mapEventRow(e));
    return { items, total, page, limit };
  }

  private assertRangeOrder(
    from?: string,
    to?: string,
    fromKey = 'from',
    toKey = 'to',
  ) {
    if (!from || !to) return;
    const a = parseDateBoundary(from, 'start');
    const b = parseDateBoundary(to, 'end');
    if (a.getTime() > b.getTime()) {
      throw new BadRequestException(
        `${fromKey} must be on or before ${toKey}`,
      );
    }
  }

  private buildEventWhere(q: ListEventsQueryDto): Prisma.TraceabilityEventWhereInput {
    const where: Prisma.TraceabilityEventWhereInput = {};

    if (q.lotId) where.lotId = q.lotId;

    const lot: Prisma.LotWhereInput = {};
    if (q.productId) lot.productId = q.productId;
    if (q.harvestDateFrom || q.harvestDateTo) {
      lot.harvestDate = {};
      if (q.harvestDateFrom) {
        lot.harvestDate.gte = parseDateBoundary(q.harvestDateFrom, 'start');
      }
      if (q.harvestDateTo) {
        lot.harvestDate.lte = parseDateBoundary(q.harvestDateTo, 'end');
      }
    }
    if (Object.keys(lot).length > 0) {
      where.lot = lot;
    }

    if (q.eventType) where.eventType = q.eventType;

    if (q.dateFrom || q.dateTo) {
      where.timestamp = {};
      if (q.dateFrom) where.timestamp.gte = parseDateBoundary(q.dateFrom, 'start');
      if (q.dateTo) where.timestamp.lte = parseDateBoundary(q.dateTo, 'end');
    }

    return where;
  }

  private mapEventRow(
    e: Prisma.TraceabilityEventGetPayload<{
      include: { lot: { include: { product: true } }; actor: true };
    }>,
  ) {
    return {
      id: e.id,
      lotId: e.lotId,
      lotCode: e.lot.lotCode,
      productId: e.lot.productId,
      actorId: e.actorId,
      eventType: e.eventType,
      location: e.location,
      notes: e.notes,
      metadata: e.metadata,
      timestamp: e.timestamp,
      product: e.lot.product,
      actor: e.actor,
    };
  }

  /** Aggregated traceability timeline for every lot of this product (authenticated). */
  async findHistoryByProductId(productId: string) {
    await this.productsService.findById(productId);
    const rows = await this.traceabilityRepository.findByProductId(productId);
    return rows.map((e) => this.mapEventRow(e));
  }
}

/** Date-only `YYYY-MM-DD` → UTC day bounds; full ISO strings parsed as-is. */
function parseDateBoundary(value: string, mode: 'start' | 'end'): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    if (mode === 'start') return new Date(Date.UTC(y, mo, d, 0, 0, 0, 0));
    return new Date(Date.UTC(y, mo, d, 23, 59, 59, 999));
  }
  return new Date(value);
}
