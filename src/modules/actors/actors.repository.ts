import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ActorsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.ActorCreateInput) {
    return this.prisma.actor.create({ data });
  }

  findById(id: string) {
    return this.prisma.actor.findUnique({ where: { id } });
  }

  findAll(params: {
    skip?: number;
    take?: number;
    where?: Prisma.ActorWhereInput;
  }) {
    return this.prisma.actor.findMany({
      ...params,
      orderBy: { createdAt: 'desc' },
    });
  }

  count(where?: Prisma.ActorWhereInput) {
    return this.prisma.actor.count({ where });
  }

  update(id: string, data: Prisma.ActorUpdateInput) {
    return this.prisma.actor.update({ where: { id }, data });
  }

  delete(id: string) {
    return this.prisma.actor.delete({ where: { id } });
  }
}
