import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ProductsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.ProductCreateInput) {
    return this.prisma.product.create({ data });
  }

  findById(id: string) {
    return this.prisma.product.findUnique({ where: { id } });
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
