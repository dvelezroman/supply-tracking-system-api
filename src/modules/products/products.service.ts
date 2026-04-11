import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ProductsRepository } from './products.repository';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import {
  isPublicVisibilityKey,
  mergeVisibilityPatch,
} from '../../common/public-visibility/public-visibility';

@Injectable()
export class ProductsService {
  constructor(private readonly productsRepository: ProductsRepository) {}

  async create(dto: CreateProductDto) {
    const existing = await this.productsRepository.findBySku(dto.sku);
    if (existing) throw new ConflictException(`SKU '${dto.sku}' already exists`);
    return this.productsRepository.create(dto);
  }

  async findById(id: string) {
    const product = await this.productsRepository.findById(id);
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async findAll(page?: number, limit?: number, search?: string) {
    const p = Math.max(1, Number(page) || 1);
    const l = Math.min(500, Math.max(1, Number(limit) || 20));
    const skip = (p - 1) * l;
    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { sku: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : undefined;

    const [rows, total] = await Promise.all([
      this.productsRepository.findAll({ skip, take: l, where }),
      this.productsRepository.count(where),
    ]);
    const items = rows.map(({ _count, ...p }) => ({
      ...p,
      lotCount: _count.lots,
    }));
    return { items, total, page: p, limit: l };
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.findById(id);
    return this.productsRepository.update(id, dto);
  }

  async remove(id: string) {
    await this.findById(id);
    return this.productsRepository.delete(id);
  }

  assertVisibilityPatch(patch: Record<string, boolean>): void {
    for (const [k, v] of Object.entries(patch)) {
      if (!isPublicVisibilityKey(k)) {
        throw new BadRequestException(`Unknown visibility key: ${k}`);
      }
      if (typeof v !== 'boolean') {
        throw new BadRequestException(`Invalid value for ${k}`);
      }
    }
  }

  async updatePublicVisibilityDefaults(id: string, patch: Record<string, boolean>) {
    this.assertVisibilityPatch(patch);
    const product = await this.findById(id);
    const merged = mergeVisibilityPatch(product.publicVisibilityDefaults, patch);
    return this.productsRepository.update(id, {
      publicVisibilityDefaults: merged as unknown as Prisma.InputJsonValue,
    });
  }
}
