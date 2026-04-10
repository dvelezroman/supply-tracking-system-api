import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { ProductsRepository } from './products.repository';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

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

  async findAll(page: number, limit: number, search?: string) {
    const skip = (page - 1) * limit;
    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { sku: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : undefined;

    const [items, total] = await Promise.all([
      this.productsRepository.findAll({ skip, take: limit, where }),
      this.productsRepository.count(where),
    ]);
    return { items, total, page, limit };
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.findById(id);
    return this.productsRepository.update(id, dto);
  }

  async remove(id: string) {
    await this.findById(id);
    return this.productsRepository.delete(id);
  }
}
