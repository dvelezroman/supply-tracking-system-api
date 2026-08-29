import { Injectable } from '@nestjs/common';
import {
  Prisma,
  Presentation,
  RecipeStatus,
  RecipeSourceType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const listSelect = {
  id: true,
  slug: true,
  name: true,
  description: true,
  category: true,
  difficulty: true,
  imageUrl: true,
  likeCount: true,
  status: true,
  publishedAt: true,
  language: true,
  sourceType: true,
  suitablePresentations: true,
  techniques: true,
  tags: true,
  cuisine: true,
  region: true,
  prepMinutes: true,
  cookMinutes: true,
  servings: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.RecipeSelect;

@Injectable()
export class RecipesRepository {
  constructor(private readonly prisma: PrismaService) {}

  get client() {
    return this.prisma;
  }

  async findById(id: string) {
    return this.prisma.recipe.findUnique({
      where: { id },
      include: {
        products: { include: { product: true } },
        _count: { select: { likes: true, chunks: true } },
      },
    });
  }

  async findBySlug(slug: string) {
    return this.prisma.recipe.findUnique({
      where: { slug },
      include: {
        products: { include: { product: true } },
      },
    });
  }

  async findPublishedBySlug(slug: string) {
    return this.prisma.recipe.findFirst({
      where: { slug, status: RecipeStatus.PUBLISHED },
      include: {
        products: { include: { product: true } },
      },
    });
  }

  async create(data: Prisma.RecipeCreateInput) {
    return this.prisma.recipe.create({
      data,
      include: { products: { include: { product: true } } },
    });
  }

  async update(id: string, data: Prisma.RecipeUpdateInput) {
    return this.prisma.recipe.update({
      where: { id },
      data,
      include: { products: { include: { product: true } } },
    });
  }

  async delete(id: string) {
    return this.prisma.recipe.delete({ where: { id } });
  }

  async listAdmin(params: {
    page: number;
    limit: number;
    q?: string;
    status?: RecipeStatus;
    category?: string;
  }) {
    const where: Prisma.RecipeWhereInput = {};
    if (params.status) where.status = params.status;
    if (params.category) where.category = params.category;
    if (params.q?.trim()) {
      const q = params.q.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { category: { contains: q, mode: 'insensitive' } },
        { searchText: { contains: q, mode: 'insensitive' } },
      ];
    }
    const skip = (params.page - 1) * params.limit;
    const [items, total] = await Promise.all([
      this.prisma.recipe.findMany({
        where,
        select: listSelect,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: params.limit,
      }),
      this.prisma.recipe.count({ where }),
    ]);
    return { items, total, page: params.page, limit: params.limit };
  }

  async searchPublished(params: {
    page: number;
    limit: number;
    q?: string;
    category?: string;
    sort?: 'relevance' | 'popular' | 'recent';
    presentation?: Presentation;
    difficulty?: string;
  }) {
    const where: Prisma.RecipeWhereInput = {
      status: RecipeStatus.PUBLISHED,
    };
    if (params.category) where.category = params.category;
    if (params.difficulty) where.difficulty = params.difficulty;
    if (params.presentation) {
      where.suitablePresentations = { has: params.presentation };
    }
    if (params.q?.trim()) {
      const q = params.q.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { category: { contains: q, mode: 'insensitive' } },
        { searchText: { contains: q, mode: 'insensitive' } },
        { tags: { has: q } },
        { techniques: { has: q } },
      ];
    }

    let orderBy: Prisma.RecipeOrderByWithRelationInput[] = [
      { likeCount: 'desc' },
      { publishedAt: 'desc' },
    ];
    if (params.sort === 'recent') {
      orderBy = [{ publishedAt: 'desc' }, { likeCount: 'desc' }];
    } else if (params.sort === 'popular') {
      orderBy = [{ likeCount: 'desc' }, { publishedAt: 'desc' }];
    } else if (params.q?.trim()) {
      orderBy = [{ likeCount: 'desc' }, { name: 'asc' }];
    }

    const skip = (params.page - 1) * params.limit;
    const [items, total] = await Promise.all([
      this.prisma.recipe.findMany({
        where,
        select: listSelect,
        orderBy,
        skip,
        take: params.limit,
      }),
      this.prisma.recipe.count({ where }),
    ]);
    return { items, total, page: params.page, limit: params.limit };
  }

  async popular(limit: number) {
    return this.prisma.recipe.findMany({
      where: { status: RecipeStatus.PUBLISHED },
      select: listSelect,
      orderBy: [{ likeCount: 'desc' }, { publishedAt: 'desc' }],
      take: limit,
    });
  }

  async trending(limit: number, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const grouped = await this.prisma.recipeLike.groupBy({
      by: ['recipeId'],
      where: { createdAt: { gte: since }, recipe: { status: RecipeStatus.PUBLISHED } },
      _count: { recipeId: true },
      orderBy: { _count: { recipeId: 'desc' } },
      take: limit,
    });

    if (!grouped.length) {
      return this.popular(limit);
    }

    const ids = grouped.map((g) => g.recipeId);
    const recipes = await this.prisma.recipe.findMany({
      where: { id: { in: ids }, status: RecipeStatus.PUBLISHED },
      select: listSelect,
    });
    const byId = new Map(recipes.map((r) => [r.id, r]));
    return ids.map((id) => byId.get(id)).filter(Boolean);
  }

  async findLike(recipeId: string, clientKey: string) {
    return this.prisma.recipeLike.findUnique({
      where: { recipeId_clientKey: { recipeId, clientKey } },
    });
  }

  async addLike(recipeId: string, clientKey: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.recipeLike.create({ data: { recipeId, clientKey } });
      return tx.recipe.update({
        where: { id: recipeId },
        data: { likeCount: { increment: 1 } },
        select: listSelect,
      });
    });
  }

  async removeLike(recipeId: string, clientKey: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.recipeLike.delete({
        where: { recipeId_clientKey: { recipeId, clientKey } },
      });
      return tx.recipe.update({
        where: { id: recipeId },
        data: { likeCount: { decrement: 1 } },
        select: listSelect,
      });
    });
  }

  async replaceProductLinks(recipeId: string, productIds: string[]) {
    await this.prisma.$transaction(async (tx) => {
      await tx.recipeProduct.deleteMany({ where: { recipeId } });
      if (productIds.length) {
        await tx.recipeProduct.createMany({
          data: productIds.map((productId) => ({ recipeId, productId })),
        });
      }
    });
    return this.findById(recipeId);
  }

  async findByContentHash(contentHash: string) {
    return this.prisma.recipe.findFirst({ where: { contentHash } });
  }

  async ensureUniqueSlug(base: string, excludeId?: string): Promise<string> {
    let slug = base || 'receta';
    let n = 0;
    while (true) {
      const candidate = n === 0 ? slug : `${slug}-${n}`;
      const existing = await this.prisma.recipe.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!existing || existing.id === excludeId) return candidate;
      n += 1;
    }
  }

  async deleteChunks(recipeId: string) {
    return this.prisma.recipeChunk.deleteMany({ where: { recipeId } });
  }

  async createChunkRow(data: {
    recipeId: string;
    chunkIndex: number;
    content: string;
  }) {
    return this.prisma.recipeChunk.create({
      data: {
        recipeId: data.recipeId,
        chunkIndex: data.chunkIndex,
        content: data.content,
      },
    });
  }

  async setChunkChromaId(chunkId: string, chromaId: string) {
    return this.prisma.recipeChunk.update({
      where: { id: chunkId },
      data: { chromaId },
    });
  }

  async createIngestJob(data: {
    sourceType: RecipeSourceType;
    sourceUrl?: string;
    query?: string;
    status?: string;
    rawPayload?: Prisma.InputJsonValue;
  }) {
    return this.prisma.recipeIngestJob.create({
      data: {
        sourceType: data.sourceType,
        sourceUrl: data.sourceUrl,
        query: data.query,
        status: data.status ?? 'PENDING',
        rawPayload: data.rawPayload,
      },
    });
  }

  async updateIngestJob(
    id: string,
    data: {
      status?: string;
      resultRecipeId?: string;
      error?: string;
      rawPayload?: Prisma.InputJsonValue;
    },
  ) {
    return this.prisma.recipeIngestJob.update({ where: { id }, data });
  }
}
