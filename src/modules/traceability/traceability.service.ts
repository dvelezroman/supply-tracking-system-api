import { Injectable } from '@nestjs/common';
import { TraceabilityRepository } from './traceability.repository';
import { CreateEventDto } from './dto/create-event.dto';
import { LotsService } from '../lots/lots.service';
import { ActorsService } from '../actors/actors.service';

@Injectable()
export class TraceabilityService {
  constructor(
    private readonly traceabilityRepository: TraceabilityRepository,
    private readonly lotsService: LotsService,
    private readonly actorsService: ActorsService,
  ) {}

  async recordEvent(dto: CreateEventDto) {
    // Validate lot and actor exist before writing the event
    await Promise.all([
      this.lotsService.findById(dto.lotId),
      this.actorsService.findById(dto.actorId),
    ]);

    const { lotId, actorId, ...rest } = dto;
    return this.traceabilityRepository.create({
      ...rest,
      lot:   { connect: { id: lotId } },
      actor: { connect: { id: actorId } },
    });
  }

  async findAll(page: number, limit: number, lotId?: string) {
    const skip = (page - 1) * limit;
    const where = lotId ? { lotId } : undefined;
    const [items, total] = await Promise.all([
      this.traceabilityRepository.findAll({ skip, take: limit, where }),
      this.traceabilityRepository.count(where),
    ]);
    return { items, total, page, limit };
  }
}
