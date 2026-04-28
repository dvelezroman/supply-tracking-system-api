import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const EVENT_INCLUDE = {
  lot: { include: { product: true } },
  actor: true,
} satisfies Prisma.TraceabilityEventInclude;

@Injectable()
export class TraceabilityRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.TraceabilityEventCreateInput) {
    return this.prisma.traceabilityEvent.create({
      data,
      include: EVENT_INCLUDE,
    });
  }

  findByLot(lotId: string) {
    return this.prisma.traceabilityEvent.findMany({
      where: { lotId, deletedAt: null },
      include: { actor: true },
      orderBy: { timestamp: 'asc' },
    });
  }

  findByIdActive(id: string) {
    return this.prisma.traceabilityEvent.findFirst({
      where: { id, deletedAt: null },
      include: EVENT_INCLUDE,
    });
  }

  findAll(params: {
    skip?: number;
    take?: number;
    where?: Prisma.TraceabilityEventWhereInput;
  }) {
    return this.prisma.traceabilityEvent.findMany({
      ...params,
      include: EVENT_INCLUDE,
      orderBy: { timestamp: 'desc' },
    });
  }

  count(where?: Prisma.TraceabilityEventWhereInput) {
    return this.prisma.traceabilityEvent.count({ where });
  }

  /** All events for lots belonging to this product, chronological (oldest first). */
  findByProductId(productId: string) {
    return this.prisma.traceabilityEvent.findMany({
      where: { deletedAt: null, lot: { productId } },
      include: EVENT_INCLUDE,
      orderBy: { timestamp: 'asc' },
    });
  }

  updateById(id: string, data: Prisma.TraceabilityEventUpdateInput) {
    return this.prisma.traceabilityEvent.update({
      where: { id },
      data,
      include: EVENT_INCLUDE,
    });
  }

  softDelete(id: string) {
    return this.prisma.traceabilityEvent.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
