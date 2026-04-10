import { Injectable, NotFoundException } from '@nestjs/common';
import { ActorsRepository } from './actors.repository';
import { CreateActorDto } from './dto/create-actor.dto';
import { UpdateActorDto } from './dto/update-actor.dto';

@Injectable()
export class ActorsService {
  constructor(private readonly actorsRepository: ActorsRepository) {}

  create(dto: CreateActorDto) {
    return this.actorsRepository.create(dto);
  }

  async findById(id: string) {
    const actor = await this.actorsRepository.findById(id);
    if (!actor) throw new NotFoundException('Actor not found');
    return actor;
  }

  async findAll(page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.actorsRepository.findAll({ skip, take: limit }),
      this.actorsRepository.count(),
    ]);
    return { items, total, page, limit };
  }

  async update(id: string, dto: UpdateActorDto) {
    await this.findById(id);
    return this.actorsRepository.update(id, dto);
  }

  async remove(id: string) {
    await this.findById(id);
    return this.actorsRepository.delete(id);
  }
}
