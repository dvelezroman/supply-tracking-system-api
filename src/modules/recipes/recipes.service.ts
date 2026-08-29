import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RecipeStatus, RecipeSourceType } from '@prisma/client';
import {
  CreateRecipeDto,
  UpdateRecipeDto,
} from './dto/recipe.dto';
import { RecipeEmbeddingsService } from './recipe-embeddings.service';
import {
  buildSearchText,
  contentHashFrom,
  RecipeIngredient,
  RecipeStep,
  slugify,
} from './recipes.helpers';
import { RecipesRepository } from './recipes.repository';

@Injectable()
export class RecipesService {
  constructor(
    private readonly repo: RecipesRepository,
    private readonly embeddings: RecipeEmbeddingsService,
  ) {}

  async listAdmin(query: {
    page?: number;
    limit?: number;
    q?: string;
    status?: RecipeStatus;
    category?: string;
  }) {
    return this.repo.listAdmin({
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      q: query.q,
      status: query.status,
      category: query.category,
    });
  }

  async searchPublic(query: {
    page?: number;
    limit?: number;
    q?: string;
    category?: string;
    sort?: 'relevance' | 'popular' | 'recent';
    presentation?: import('@prisma/client').Presentation;
    difficulty?: string;
  }) {
    return this.repo.searchPublished({
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      q: query.q,
      category: query.category,
      sort: query.sort ?? (query.q ? 'relevance' : 'popular'),
      presentation: query.presentation,
      difficulty: query.difficulty,
    });
  }

  async popular(limit = 6) {
    return this.repo.popular(limit);
  }

  async trending(limit = 6) {
    return this.repo.trending(limit);
  }

  async getAdminById(id: string) {
    const recipe = await this.repo.findById(id);
    if (!recipe) throw new NotFoundException('Recipe not found');
    return recipe;
  }

  async getPublishedBySlug(slug: string) {
    const recipe = await this.repo.findPublishedBySlug(slug);
    if (!recipe) throw new NotFoundException('Recipe not found');
    return recipe;
  }

  async create(dto: CreateRecipeDto) {
    const baseSlug = slugify(dto.slug || dto.name);
    const slug = await this.repo.ensureUniqueSlug(baseSlug);
    const ingredients = (dto.ingredients ?? []) as RecipeIngredient[];
    const steps = (dto.steps ?? []) as RecipeStep[];
    const status = dto.status ?? RecipeStatus.DRAFT;
    const searchText = buildSearchText({
      name: dto.name,
      description: dto.description,
      category: dto.category,
      cuisine: dto.cuisine,
      region: dto.region,
      tips: dto.tips,
      techniques: dto.techniques,
      tags: dto.tags,
      ingredients,
      steps,
    });
    const hash =
      dto.sourceUrl || dto.name
        ? contentHashFrom([
            dto.sourceType ?? RecipeSourceType.MANUAL,
            dto.sourceUrl ?? '',
            dto.name,
            searchText.slice(0, 500),
          ])
        : undefined;

    const data: Prisma.RecipeCreateInput = {
      slug,
      name: dto.name,
      description: dto.description,
      category: dto.category,
      cuisine: dto.cuisine,
      region: dto.region,
      language: dto.language ?? 'es',
      difficulty: dto.difficulty,
      prepMinutes: dto.prepMinutes,
      cookMinutes: dto.cookMinutes,
      servings: dto.servings,
      ingredients: ingredients as Prisma.InputJsonValue,
      steps: steps as Prisma.InputJsonValue,
      tips: dto.tips,
      techniques: dto.techniques ?? [],
      tags: dto.tags ?? [],
      allergens: dto.allergens ?? [],
      dietaryTags: dto.dietaryTags ?? [],
      suitablePresentations: dto.suitablePresentations ?? [],
      imageUrl: dto.imageUrl,
      sourceType: dto.sourceType ?? RecipeSourceType.MANUAL,
      sourceUrl: dto.sourceUrl,
      sourceName: dto.sourceName,
      attribution: dto.attribution,
      license: dto.license,
      status,
      contentHash: hash,
      searchText,
      publishedAt: status === RecipeStatus.PUBLISHED ? new Date() : null,
      products: dto.productIds?.length
        ? {
            create: dto.productIds.map((productId) => ({ productId })),
          }
        : undefined,
    };

    const recipe = await this.repo.create(data);
    if (recipe.status === RecipeStatus.PUBLISHED) {
      await this.embeddings.indexRecipe(recipe.id).catch(() => undefined);
    }
    return recipe;
  }

  async createFromIngest(input: {
    name: string;
    description?: string;
    category?: string;
    cuisine?: string;
    language?: string;
    ingredients: RecipeIngredient[];
    steps: RecipeStep[];
    imageUrl?: string;
    sourceType: RecipeSourceType;
    sourceUrl?: string;
    sourceName?: string;
    attribution?: string;
    license?: string;
    status: RecipeStatus;
    contentHash: string;
    tags?: string[];
  }) {
    const slug = await this.repo.ensureUniqueSlug(slugify(input.name));
    const searchText = buildSearchText(input);
    return this.repo.create({
      slug,
      name: input.name,
      description: input.description,
      category: input.category,
      cuisine: input.cuisine,
      language: input.language ?? 'es',
      ingredients: input.ingredients as Prisma.InputJsonValue,
      steps: input.steps as Prisma.InputJsonValue,
      imageUrl: input.imageUrl,
      sourceType: input.sourceType,
      sourceUrl: input.sourceUrl,
      sourceName: input.sourceName,
      attribution: input.attribution,
      license: input.license,
      status: input.status,
      contentHash: input.contentHash,
      searchText,
      tags: input.tags ?? [],
      publishedAt:
        input.status === RecipeStatus.PUBLISHED ? new Date() : null,
    });
  }

  async update(id: string, dto: UpdateRecipeDto) {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException('Recipe not found');

    const ingredients = (dto.ingredients ??
      existing.ingredients) as RecipeIngredient[];
    const steps = (dto.steps ?? existing.steps) as RecipeStep[];
    const name = dto.name ?? existing.name;
    let slug = existing.slug;
    if (dto.slug && dto.slug !== existing.slug) {
      slug = await this.repo.ensureUniqueSlug(slugify(dto.slug), id);
    } else if (dto.name && dto.name !== existing.name) {
      slug = await this.repo.ensureUniqueSlug(slugify(dto.name), id);
    }

    const nextStatus = dto.status ?? existing.status;
    const searchText = buildSearchText({
      name,
      description: dto.description ?? existing.description,
      category: dto.category ?? existing.category,
      cuisine: dto.cuisine ?? existing.cuisine,
      region: dto.region ?? existing.region,
      tips: dto.tips ?? existing.tips,
      techniques: dto.techniques ?? existing.techniques,
      tags: dto.tags ?? existing.tags,
      ingredients,
      steps,
    });

    const data: Prisma.RecipeUpdateInput = {
      slug,
      name,
      description: dto.description,
      category: dto.category,
      cuisine: dto.cuisine,
      region: dto.region,
      language: dto.language,
      difficulty: dto.difficulty,
      prepMinutes: dto.prepMinutes,
      cookMinutes: dto.cookMinutes,
      servings: dto.servings,
      ingredients: dto.ingredients
        ? (ingredients as Prisma.InputJsonValue)
        : undefined,
      steps: dto.steps ? (steps as Prisma.InputJsonValue) : undefined,
      tips: dto.tips,
      techniques: dto.techniques,
      tags: dto.tags,
      allergens: dto.allergens,
      dietaryTags: dto.dietaryTags,
      suitablePresentations: dto.suitablePresentations,
      imageUrl: dto.imageUrl,
      sourceType: dto.sourceType,
      sourceUrl: dto.sourceUrl,
      sourceName: dto.sourceName,
      attribution: dto.attribution,
      license: dto.license,
      status: nextStatus,
      searchText,
      publishedAt:
        nextStatus === RecipeStatus.PUBLISHED
          ? existing.publishedAt ?? new Date()
          : nextStatus === RecipeStatus.ARCHIVED
            ? existing.publishedAt
            : existing.publishedAt,
    };

    if (dto.productIds) {
      await this.repo.replaceProductLinks(id, dto.productIds);
    }

    const recipe = await this.repo.update(id, data);
    if (
      nextStatus === RecipeStatus.PUBLISHED ||
      existing.status === RecipeStatus.PUBLISHED
    ) {
      await this.embeddings.indexRecipe(recipe.id).catch(() => undefined);
    }
    return recipe;
  }

  async setStatus(id: string, status: RecipeStatus) {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException('Recipe not found');
    const recipe = await this.repo.update(id, {
      status,
      publishedAt:
        status === RecipeStatus.PUBLISHED
          ? existing.publishedAt ?? new Date()
          : existing.publishedAt,
    });
    await this.embeddings.indexRecipe(recipe.id).catch(() => undefined);
    return recipe;
  }

  async remove(id: string) {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException('Recipe not found');
    await this.repo.deleteChunks(id);
    return this.repo.delete(id);
  }

  async linkProducts(id: string, productIds: string[]) {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException('Recipe not found');
    return this.repo.replaceProductLinks(id, productIds);
  }

  async like(slug: string, clientKey: string) {
    const recipe = await this.repo.findPublishedBySlug(slug);
    if (!recipe) throw new NotFoundException('Recipe not found');
    const existing = await this.repo.findLike(recipe.id, clientKey);
    if (existing) {
      throw new ConflictException('Already liked');
    }
    return this.repo.addLike(recipe.id, clientKey);
  }

  async unlike(slug: string, clientKey: string) {
    const recipe = await this.repo.findPublishedBySlug(slug);
    if (!recipe) throw new NotFoundException('Recipe not found');
    const existing = await this.repo.findLike(recipe.id, clientKey);
    if (!existing) {
      throw new BadRequestException('Not liked');
    }
    return this.repo.removeLike(recipe.id, clientKey);
  }

  async likeStatus(slug: string, clientKey: string) {
    const recipe = await this.repo.findPublishedBySlug(slug);
    if (!recipe) throw new NotFoundException('Recipe not found');
    const like = await this.repo.findLike(recipe.id, clientKey);
    return {
      slug: recipe.slug,
      likeCount: recipe.likeCount,
      liked: !!like,
    };
  }

  async reindex(id: string) {
    const recipe = await this.repo.findById(id);
    if (!recipe) throw new NotFoundException('Recipe not found');
    await this.embeddings.indexRecipe(id);
    return { ok: true, id };
  }
}
