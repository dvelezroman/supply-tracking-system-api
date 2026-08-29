import { createHash } from 'crypto';
import {
  Presentation,
  Recipe,
  RecipeSourceType,
  RecipeStatus,
} from '@prisma/client';

export type RecipeIngredient = {
  name: string;
  qty?: string;
  unit?: string;
  notes?: string;
};

export type RecipeStep = {
  order: number;
  text: string;
};

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140);
}

export function buildSearchText(input: {
  name: string;
  description?: string | null;
  category?: string | null;
  cuisine?: string | null;
  region?: string | null;
  tips?: string | null;
  techniques?: string[];
  tags?: string[];
  ingredients?: RecipeIngredient[] | unknown;
  steps?: RecipeStep[] | unknown;
}): string {
  const ingredients = Array.isArray(input.ingredients)
    ? (input.ingredients as RecipeIngredient[])
        .map((i) => [i.name, i.qty, i.unit, i.notes].filter(Boolean).join(' '))
        .join('; ')
    : '';
  const steps = Array.isArray(input.steps)
    ? (input.steps as RecipeStep[])
        .map((s) => s.text)
        .join(' ')
    : '';
  return [
    input.name,
    input.description,
    input.category,
    input.cuisine,
    input.region,
    input.tips,
    ...(input.techniques ?? []),
    ...(input.tags ?? []),
    ingredients,
    steps,
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 20000);
}

export function contentHashFrom(parts: string[]): string {
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

export function chunkRecipeForEmbed(recipe: {
  name: string;
  description?: string | null;
  category?: string | null;
  ingredients?: unknown;
  steps?: unknown;
  tips?: string | null;
  techniques?: string[];
  tags?: string[];
}): { chunkIndex: number; content: string }[] {
  const chunks: { chunkIndex: number; content: string }[] = [];
  chunks.push({
    chunkIndex: 0,
    content: [
      `Receta: ${recipe.name}`,
      recipe.category ? `Categoría: ${recipe.category}` : '',
      recipe.description ?? '',
      recipe.techniques?.length
        ? `Técnicas: ${recipe.techniques.join(', ')}`
        : '',
      recipe.tags?.length ? `Tags: ${recipe.tags.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  });

  const ingredients = Array.isArray(recipe.ingredients)
    ? (recipe.ingredients as RecipeIngredient[])
    : [];
  if (ingredients.length) {
    chunks.push({
      chunkIndex: 1,
      content: `Ingredientes de ${recipe.name}:\n${ingredients
        .map((i) =>
          [i.qty, i.unit, i.name, i.notes].filter(Boolean).join(' ').trim(),
        )
        .join('\n')}`,
    });
  }

  const steps = Array.isArray(recipe.steps)
    ? (recipe.steps as RecipeStep[])
    : [];
  if (steps.length) {
    chunks.push({
      chunkIndex: 2,
      content: `Preparación de ${recipe.name}:\n${steps
        .sort((a, b) => a.order - b.order)
        .map((s) => `${s.order}. ${s.text}`)
        .join('\n')}${recipe.tips ? `\nTips: ${recipe.tips}` : ''}`,
    });
  }

  return chunks.filter((c) => c.content.trim().length > 0);
}

export type RecipeListItem = Pick<
  Recipe,
  | 'id'
  | 'slug'
  | 'name'
  | 'description'
  | 'category'
  | 'difficulty'
  | 'imageUrl'
  | 'likeCount'
  | 'status'
  | 'publishedAt'
  | 'language'
  | 'sourceType'
> & {
  suitablePresentations?: Presentation[];
  techniques?: string[];
  tags?: string[];
};

export { RecipeStatus, RecipeSourceType, Presentation };
