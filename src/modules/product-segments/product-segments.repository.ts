import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ProductSegmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.ProductSegmentCreateInput) {
    return this.prisma.productSegment.create({ data });
  }

  findById(id: string) {
    return this.prisma.productSegment.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });
  }

  findByNameInsensitive(name: string) {
    return this.prisma.productSegment.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
  }

  findAll(params?: { orderBy?: Prisma.ProductSegmentOrderByWithRelationInput }) {
    return this.prisma.productSegment.findMany({
      orderBy: params?.orderBy ?? { name: 'asc' },
      include: { _count: { select: { products: true } } },
    });
  }

  update(id: string, data: Prisma.ProductSegmentUpdateInput) {
    return this.prisma.productSegment.update({ where: { id }, data });
  }

  delete(id: string) {
    return this.prisma.productSegment.delete({ where: { id } });
  }
}
