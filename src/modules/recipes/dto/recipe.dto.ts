import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Presentation, RecipeSourceType, RecipeStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class RecipeIngredientDto {
  @ApiProperty({ example: 'Camarones' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ example: '500' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  qty?: string;

  @ApiPropertyOptional({ example: 'g' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  notes?: string;
}

export class RecipeStepDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  order: number;

  @ApiProperty({ example: 'Limpiar y cocer los camarones.' })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text: string;
}

export class CreateRecipeDto {
  @ApiPropertyOptional({ example: 'ceviche-de-camaron' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  slug?: string;

  @ApiProperty({ example: 'Ceviche de Camarón' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  description?: string;

  @ApiPropertyOptional({ example: 'Entrada / Coctel' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  cuisine?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  region?: string;

  @ApiPropertyOptional({ default: 'es' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  language?: string;

  @ApiPropertyOptional({ example: 'easy' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  difficulty?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  prepMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  cookMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  servings?: number;

  @ApiPropertyOptional({ type: [RecipeIngredientDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipeIngredientDto)
  ingredients?: RecipeIngredientDto[];

  @ApiPropertyOptional({ type: [RecipeStepDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipeStepDto)
  steps?: RecipeStepDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  tips?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(40)
  techniques?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(40)
  tags?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergens?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dietaryTags?: string[];

  @ApiPropertyOptional({ enum: Presentation, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(Presentation, { each: true })
  suitablePresentations?: Presentation[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  imageUrl?: string;

  @ApiPropertyOptional({ enum: RecipeSourceType })
  @IsOptional()
  @IsEnum(RecipeSourceType)
  sourceType?: RecipeSourceType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  sourceUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  sourceName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  attribution?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  license?: string;

  @ApiPropertyOptional({ enum: RecipeStatus })
  @IsOptional()
  @IsEnum(RecipeStatus)
  status?: RecipeStatus;

  @ApiPropertyOptional({ type: [String], description: 'Product UUIDs to link' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  productIds?: string[];
}

export class UpdateRecipeDto extends PartialType(CreateRecipeDto) {}

export class RecipeQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Search query' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @ApiPropertyOptional({ enum: ['relevance', 'popular', 'recent'] })
  @IsOptional()
  @IsString()
  sort?: 'relevance' | 'popular' | 'recent';

  @ApiPropertyOptional({ enum: RecipeStatus })
  @IsOptional()
  @IsEnum(RecipeStatus)
  status?: RecipeStatus;

  @ApiPropertyOptional({ enum: Presentation })
  @IsOptional()
  @IsEnum(Presentation)
  presentation?: Presentation;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  difficulty?: string;
}

export class RecipeLikeDto {
  @ApiProperty({
    description: 'Anonymous client UUID from localStorage',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(80)
  clientKey: string;
}

export class PopularQueryDto {
  @ApiPropertyOptional({ default: 6 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  limit?: number = 6;
}

export class ImportApiDto {
  @ApiPropertyOptional({
    example: 'shrimp',
    description: 'Search term for TheMealDB / Spoonacular',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  query?: string = 'shrimp';
}

export class ImportUrlDto {
  @ApiProperty({ example: 'https://www.themealdb.com/meal/52772' })
  @IsUrl({ require_protocol: true })
  @MaxLength(1000)
  url: string;
}

export class ChatMessageDto {
  @ApiProperty({ example: 'Quiero un cóctel frío de camarón' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  sessionId?: string;

  /** UI language toggle (`en` | `es`). Controls Mary reply language. */
  @ApiPropertyOptional({ enum: ['es', 'en'], default: 'es' })
  @IsOptional()
  @IsIn(['es', 'en'])
  lang?: 'es' | 'en';
}

export class SetRecipeStatusDto {
  @ApiProperty({ enum: RecipeStatus })
  @IsEnum(RecipeStatus)
  status: RecipeStatus;
}

export class LinkProductsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  productIds: string[];
}

/** Transform query boolean strings */
export function toOptionalBoolean({ value }: { value: unknown }) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  return value === 'true' || value === '1';
}

export { Transform };
