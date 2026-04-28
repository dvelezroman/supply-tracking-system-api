import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RestaurantsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.RestaurantCreateInput) {
    return this.prisma.restaurant.create({ data });
  }

  findById(id: string) {
    return this.prisma.restaurant.findUnique({ where: { id } });
  }

  findBySlug(slug: string) {
    return this.prisma.restaurant.findUnique({ where: { slug } });
  }

  findAll(params: {
    skip?: number;
    take?: number;
    where?: Prisma.RestaurantWhereInput;
  }) {
    return this.prisma.restaurant.findMany({
      ...params,
      orderBy: { createdAt: 'desc' },
    });
  }

  count(where?: Prisma.RestaurantWhereInput) {
    return this.prisma.restaurant.count({ where });
  }

  update(id: string, data: Prisma.RestaurantUpdateInput) {
    return this.prisma.restaurant.update({ where: { id }, data });
  }

  delete(id: string) {
    return this.prisma.restaurant.delete({ where: { id } });
  }
}
