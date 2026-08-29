import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RecipeSourceType, RecipeStatus } from '@prisma/client';
import * as cheerio from 'cheerio';
import { createHash } from 'crypto';
import {
  buildSearchText,
  contentHashFrom,
  RecipeIngredient,
  RecipeStep,
  slugify,
} from './recipes.helpers';
import { RecipesRepository } from './recipes.repository';
import { RecipesService } from './recipes.service';

const ALLOWED_HOSTS = new Set([
  'www.themealdb.com',
  'themealdb.com',
  'www.bbcgoodfood.com',
  'bbcgoodfood.com',
]);

@Injectable()
export class RecipeIngestService {
  private readonly logger = new Logger(RecipeIngestService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly recipesRepo: RecipesRepository,
    private readonly recipesService: RecipesService,
  ) {}

  async importFromMealDb(query = 'shrimp') {
    const job = await this.recipesRepo.createIngestJob({
      sourceType: RecipeSourceType.API_IMPORT,
      query,
      status: 'RUNNING',
    });

    try {
      const url = `https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(query)}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new BadRequestException(`TheMealDB error: ${res.status}`);
      }
      const data = (await res.json()) as {
        meals?: Record<string, string | null>[] | null;
      };
      const meals = data.meals ?? [];
      const created: string[] = [];

      for (const meal of meals) {
        const name = meal.strMeal?.trim();
        if (!name) continue;
        const ingredients = this.mealDbIngredients(meal);
        const hasShrimp = /shrimp|prawn|camaron|camarón/i.test(
          `${name} ${ingredients.map((i) => i.name).join(' ')} ${meal.strInstructions ?? ''}`,
        );
        if (!hasShrimp && !/shrimp|prawn/i.test(query)) {
          // keep non-shrimp if user searched something else; for shrimp query filter
        }
        if (/shrimp|prawn|camaron/i.test(query) && !hasShrimp) continue;

        const steps = this.splitSteps(meal.strInstructions ?? '');
        const hash = contentHashFrom([
          'themealdb',
          meal.idMeal ?? '',
          name,
        ]);
        const existing = await this.recipesRepo.findByContentHash(hash);
        if (existing) continue;

        const recipe = await this.recipesService.createFromIngest({
          name,
          description: (meal.strInstructions ?? '').slice(0, 500),
          category: meal.strCategory || 'Plato fuerte',
          cuisine: meal.strArea || undefined,
          language: 'en',
          ingredients,
          steps,
          imageUrl: meal.strMealThumb || undefined,
          sourceType: RecipeSourceType.API_IMPORT,
          sourceUrl: meal.strSource || meal.strYoutube || undefined,
          sourceName: 'TheMealDB',
          attribution: 'TheMealDB',
          license: 'Open database (TheMealDB)',
          status: RecipeStatus.PENDING_REVIEW,
          contentHash: hash,
          tags: ['imported', 'themealdb'],
        });
        created.push(recipe.id);
      }

      await this.recipesRepo.updateIngestJob(job.id, {
        status: 'DONE',
        resultRecipeId: created[0],
        rawPayload: { createdCount: created.length, created },
      });
      return { jobId: job.id, createdCount: created.length, recipeIds: created };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.recipesRepo.updateIngestJob(job.id, {
        status: 'FAILED',
        error: message,
      });
      throw err;
    }
  }

  async importFromUrl(url: string) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException('Invalid URL');
    }
    if (!ALLOWED_HOSTS.has(parsed.hostname)) {
      throw new BadRequestException(
        `Host not allowlisted. Allowed: ${[...ALLOWED_HOSTS].join(', ')}`,
      );
    }

    const job = await this.recipesRepo.createIngestJob({
      sourceType: RecipeSourceType.SCRAPE,
      sourceUrl: url,
      status: 'RUNNING',
    });

    try {
      // TheMealDB detail page → use API if meal id present
      if (parsed.hostname.includes('themealdb.com')) {
        const mealId = parsed.pathname.match(/\/meal\/(\d+)/)?.[1];
        if (mealId) {
          const apiUrl = `https://www.themealdb.com/api/json/v1/1/lookup.php?i=${mealId}`;
          const res = await fetch(apiUrl);
          const data = (await res.json()) as {
            meals?: Record<string, string | null>[] | null;
          };
          const meal = data.meals?.[0];
          if (!meal?.strMeal) {
            throw new BadRequestException('Meal not found on TheMealDB');
          }
          const hash = contentHashFrom(['themealdb', meal.idMeal ?? '', meal.strMeal]);
          const existing = await this.recipesRepo.findByContentHash(hash);
          if (existing) {
            await this.recipesRepo.updateIngestJob(job.id, {
              status: 'DONE',
              resultRecipeId: existing.id,
            });
            return { jobId: job.id, recipe: existing, deduped: true };
          }
          const recipe = await this.recipesService.createFromIngest({
            name: meal.strMeal,
            description: (meal.strInstructions ?? '').slice(0, 500),
            category: meal.strCategory || undefined,
            cuisine: meal.strArea || undefined,
            language: 'en',
            ingredients: this.mealDbIngredients(meal),
            steps: this.splitSteps(meal.strInstructions ?? ''),
            imageUrl: meal.strMealThumb || undefined,
            sourceType: RecipeSourceType.SCRAPE,
            sourceUrl: url,
            sourceName: 'TheMealDB',
            attribution: 'TheMealDB',
            status: RecipeStatus.PENDING_REVIEW,
            contentHash: hash,
            tags: ['scraped', 'themealdb'],
          });
          await this.recipesRepo.updateIngestJob(job.id, {
            status: 'DONE',
            resultRecipeId: recipe.id,
          });
          return { jobId: job.id, recipe, deduped: false };
        }
      }

      const res = await fetch(url, {
        headers: { 'User-Agent': 'MareaAltaRecipeBot/1.0' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        throw new BadRequestException(`Fetch failed: ${res.status}`);
      }
      const html = await res.text();
      const $ = cheerio.load(html);
      const name =
        $('h1').first().text().trim() ||
        $('meta[property="og:title"]').attr('content')?.trim() ||
        'Receta importada';
      const description =
        $('meta[name="description"]').attr('content')?.trim() ||
        $('meta[property="og:description"]').attr('content')?.trim() ||
        '';
      const imageUrl =
        $('meta[property="og:image"]').attr('content')?.trim() || undefined;

      const ingredients: RecipeIngredient[] = [];
      $('li').each((_, el) => {
        const text = $(el).text().replace(/\s+/g, ' ').trim();
        if (
          text.length > 3 &&
          text.length < 200 &&
          /shrimp|prawn|camaron|oil|salt|garlic|lemon|onion|pepper|sauce|rice|flour/i.test(
            text,
          )
        ) {
          ingredients.push({ name: text });
        }
      });
      const uniqueIngredients = ingredients.slice(0, 30);
      const bodyText = $('article, .recipe-content, main').text().replace(/\s+/g, ' ').trim();
      const steps = this.splitSteps(bodyText.slice(0, 4000));
      const hash = contentHashFrom([
        'scrape',
        url,
        name,
        createHash('sha256').update(html.slice(0, 5000)).digest('hex'),
      ]);
      const existing = await this.recipesRepo.findByContentHash(hash);
      if (existing) {
        await this.recipesRepo.updateIngestJob(job.id, {
          status: 'DONE',
          resultRecipeId: existing.id,
        });
        return { jobId: job.id, recipe: existing, deduped: true };
      }

      const recipe = await this.recipesService.createFromIngest({
        name,
        description: description.slice(0, 1000) || undefined,
        category: 'Plato fuerte',
        language: 'en',
        ingredients: uniqueIngredients.length
          ? uniqueIngredients
          : [{ name: 'Camarones' }],
        steps: steps.length
          ? steps
          : [{ order: 1, text: description || 'Ver fuente original.' }],
        imageUrl,
        sourceType: RecipeSourceType.SCRAPE,
        sourceUrl: url,
        sourceName: parsed.hostname,
        attribution: parsed.hostname,
        status: RecipeStatus.PENDING_REVIEW,
        contentHash: hash,
        tags: ['scraped'],
      });

      await this.recipesRepo.updateIngestJob(job.id, {
        status: 'DONE',
        resultRecipeId: recipe.id,
        rawPayload: { url, name },
      });
      return { jobId: job.id, recipe, deduped: false };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`URL import failed: ${message}`);
      await this.recipesRepo.updateIngestJob(job.id, {
        status: 'FAILED',
        error: message,
      });
      throw err;
    }
  }

  private mealDbIngredients(
    meal: Record<string, string | null>,
  ): RecipeIngredient[] {
    const out: RecipeIngredient[] = [];
    for (let i = 1; i <= 20; i++) {
      const name = meal[`strIngredient${i}`]?.trim();
      const measure = meal[`strMeasure${i}`]?.trim();
      if (!name) continue;
      out.push({ name, qty: measure || undefined });
    }
    return out;
  }

  private splitSteps(text: string): RecipeStep[] {
    const parts = text
      .split(/\r?\n+|\.\s+(?=[A-ZÁÉÍÓÚ])/)
      .map((s) => s.trim())
      .filter((s) => s.length > 15);
    if (!parts.length && text.trim()) {
      return [{ order: 1, text: text.trim().slice(0, 2000) }];
    }
    return parts.slice(0, 40).map((text, i) => ({ order: i + 1, text }));
  }
}

// silence unused import if tree-shaken oddly
void buildSearchText;
void slugify;
