import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ProductsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.ProductCreateInput) {
    return this.prisma.product.create({ data });
  }

  private segmentInclude = {
    segment: { select: { id: true, name: true } },
  } as const;

  findById(id: string) {
    return this.prisma.product.findUnique({
      where: { id },
      include: {
        ...this.segmentInclude,
        lots: {
          select: {
            id: true,
            lotCode: true,
            harvestDate: true,
            lotSizeLbs: true,
            presentation: true,
          },
          orderBy: { harvestDate: 'desc' },
        },
      },
    });
  }

  findBySku(sku: string) {
    return this.prisma.product.findUnique({ where: { sku } });
  }

  findAll(params: {
    skip?: number;
    take?: number;
    where?: Prisma.ProductWhereInput;
  }) {
    return this.prisma.product.findMany({
      ...params,
      orderBy: { createdAt: 'desc' },
      include: {
        ...this.segmentInclude,
        _count: { select: { lots: true } },
      },
    });
  }

  count(where?: Prisma.ProductWhereInput) {
    return this.prisma.product.count({ where });
  }

  update(id: string, data: Prisma.ProductUpdateInput) {
    return this.prisma.product.update({ where: { id }, data });
  }

  delete(id: string) {
    return this.prisma.product.delete({ where: { id } });
  }
}
