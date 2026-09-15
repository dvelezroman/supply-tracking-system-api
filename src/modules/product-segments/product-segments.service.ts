import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { ProductSegmentsRepository } from './product-segments.repository';
import { CreateProductSegmentDto } from './dto/create-product-segment.dto';
import { UpdateProductSegmentDto } from './dto/update-product-segment.dto';

@Injectable()
export class ProductSegmentsService {
  constructor(private readonly repo: ProductSegmentsRepository) {}

  private normalizeName(name: string): string {
    return name.trim().replace(/\s+/g, ' ');
  }

  private mapRow<T extends { _count: { products: number } }>(
    row: T,
  ): Omit<T, '_count'> & { productCount: number } {
    const { _count, ...rest } = row;
    return { ...rest, productCount: _count.products };
  }

  async create(dto: CreateProductSegmentDto) {
    const name = this.normalizeName(dto.name);
    const existing = await this.repo.findByNameInsensitive(name);
    if (existing) {
      throw new ConflictException(`Segment '${name}' already exists`);
    }
    const row = await this.repo.create({ name });
    return { ...row, productCount: 0 };
  }

  async findAll() {
    const rows = await this.repo.findAll();
    return rows.map((r) => this.mapRow(r));
  }

  async findById(id: string) {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundException('Product segment not found');
    return this.mapRow(row);
  }

  async update(id: string, dto: UpdateProductSegmentDto) {
    await this.findById(id);
    if (dto.name === undefined) {
      return this.findById(id);
    }
    const name = this.normalizeName(dto.name);
    const existing = await this.repo.findByNameInsensitive(name);
    if (existing && existing.id !== id) {
      throw new ConflictException(`Segment '${name}' already exists`);
    }
    const updated = await this.repo.update(id, { name });
    const withCount = await this.repo.findById(updated.id);
    return this.mapRow(withCount!);
  }

  async remove(id: string) {
    await this.findById(id);
    return this.repo.delete(id);
  }

  async assertExists(id: string): Promise<void> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundException('Product segment not found');
  }
}
