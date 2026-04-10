import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const LOT_INCLUDES = {
  product: true,
  farm: true,
  lab: true,
  maturation: true,
  coPacker: true,
} satisfies Prisma.LotInclude;

@Injectable()
export class LotsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.LotCreateInput) {
    return this.prisma.lot.create({ data, include: LOT_INCLUDES });
  }

  findById(id: string) {
    return this.prisma.lot.findUnique({ where: { id }, include: LOT_INCLUDES });
  }

  findByLotCode(lotCode: string) {
    return this.prisma.lot.findUnique({ where: { lotCode }, include: LOT_INCLUDES });
  }

  findAll(params: {
    skip?: number;
    take?: number;
    where?: Prisma.LotWhereInput;
  }) {
    return this.prisma.lot.findMany({
      ...params,
      include: LOT_INCLUDES,
      orderBy: { createdAt: 'desc' },
    });
  }

  count(where?: Prisma.LotWhereInput) {
    return this.prisma.lot.count({ where });
  }

  update(id: string, data: Prisma.LotUpdateInput) {
    return this.prisma.lot.update({ where: { id }, data, include: LOT_INCLUDES });
  }

  // Full event chain for a lot, ordered chronologically
  findHistory(lotId: string) {
    return this.prisma.traceabilityEvent.findMany({
      where: { lotId },
      include: { actor: true },
      orderBy: { timestamp: 'asc' },
    });
  }
}
