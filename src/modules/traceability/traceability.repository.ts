import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TraceabilityRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.TraceabilityEventCreateInput) {
    return this.prisma.traceabilityEvent.create({
      data,
      include: { lot: { include: { product: true } }, actor: true },
    });
  }

  findByLot(lotId: string) {
    return this.prisma.traceabilityEvent.findMany({
      where: { lotId },
      include: { actor: true },
      orderBy: { timestamp: 'asc' },
    });
  }

  findAll(params: {
    skip?: number;
    take?: number;
    where?: Prisma.TraceabilityEventWhereInput;
  }) {
    return this.prisma.traceabilityEvent.findMany({
      ...params,
      include: { lot: { include: { product: true } }, actor: true },
      orderBy: { timestamp: 'desc' },
    });
  }

  count(where?: Prisma.TraceabilityEventWhereInput) {
    return this.prisma.traceabilityEvent.count({ where });
  }
}
