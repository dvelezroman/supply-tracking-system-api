import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { LotsRepository } from './lots.repository';
import { CreateLotDto } from './dto/create-lot.dto';
import { UpdateLotDto } from './dto/update-lot.dto';

@Injectable()
export class LotsService {
  constructor(private readonly lotsRepository: LotsRepository) {}

  async create(dto: CreateLotDto) {
    const existing = await this.lotsRepository.findByLotCode(dto.lotCode);
    if (existing) {
      throw new ConflictException(`Lot code '${dto.lotCode}' already exists`);
    }

    const { productId, farmId, labId, maturationId, coPackerId, harvestDate, ...rest } = dto;

    return this.lotsRepository.create({
      ...rest,
      harvestDate: new Date(harvestDate),
      product:    { connect: { id: productId } },
      farm:       { connect: { id: farmId } },
      lab:        { connect: { id: labId } },
      maturation: { connect: { id: maturationId } },
      coPacker:   { connect: { id: coPackerId } },
    });
  }

  async findById(id: string) {
    const lot = await this.lotsRepository.findById(id);
    if (!lot) throw new NotFoundException('Lot not found');
    return lot;
  }

  async findByLotCode(lotCode: string) {
    const lot = await this.lotsRepository.findByLotCode(lotCode);
    if (!lot) throw new NotFoundException(`Lot '${lotCode}' not found`);
    return lot;
  }

  async findAll(page: number, limit: number, productId?: string) {
    const skip = (page - 1) * limit;
    const where = productId ? { productId } : undefined;
    const [items, total] = await Promise.all([
      this.lotsRepository.findAll({ skip, take: limit, where }),
      this.lotsRepository.count(where),
    ]);
    return { items, total, page, limit };
  }

  async update(id: string, dto: UpdateLotDto) {
    await this.findById(id);
    const { farmId, labId, maturationId, coPackerId, harvestDate, ...rest } = dto as any;

    return this.lotsRepository.update(id, {
      ...rest,
      ...(harvestDate && { harvestDate: new Date(harvestDate) }),
      ...(farmId       && { farm:       { connect: { id: farmId } } }),
      ...(labId        && { lab:        { connect: { id: labId } } }),
      ...(maturationId && { maturation: { connect: { id: maturationId } } }),
      ...(coPackerId   && { coPacker:   { connect: { id: coPackerId } } }),
    });
  }

  async getHistory(lotCode: string) {
    const lot = await this.findByLotCode(lotCode);
    const events = await this.lotsRepository.findHistory(lot.id);
    return { lot, events };
  }
}
