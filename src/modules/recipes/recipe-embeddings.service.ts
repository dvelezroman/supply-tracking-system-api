import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RecipeStatus } from '@prisma/client';
import { ChromaClient, Collection } from 'chromadb';
import OpenAI from 'openai';
import { RecipesRepository } from './recipes.repository';
import { chunkRecipeForEmbed } from './recipes.helpers';

export type RetrievedChunk = {
  id: string;
  recipeId: string;
  content: string;
  distance: number;
  slug: string;
  name: string;
  category: string | null;
};

@Injectable()
export class RecipeEmbeddingsService implements OnModuleInit {
  private readonly logger = new Logger(RecipeEmbeddingsService.name);
  private openai: OpenAI | null = null;
  private chroma: ChromaClient | null = null;
  private collection: Collection | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly recipes: RecipesRepository,
  ) {
    const apiKey = this.config.get<string>('openai.apiKey');
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    }
  }

  async onModuleInit() {
    if (this.openai) {
      this.logger.log(
        `[AI] OpenAI ready — chat=${this.chatModel()} embed=${this.embedModel()}`,
      );
    } else {
      this.logger.warn(
        '[AI] OPENAI_API_KEY missing — Mary chat + recipe indexing disabled',
      );
    }

    await this.ensureCollection()
      .then((col) => {
        this.logger.log(
          `[AI] Chroma connected — ${this.chromaUrl()} collection=${col.name}`,
        );
      })
      .catch((err) => {
        this.logger.warn(
          `[AI] ChromaDB not ready yet (${err instanceof Error ? err.message : err}). RAG indexing deferred until Chroma is up.`,
        );
      });
  }

  isConfigured(): boolean {
    return !!this.openai;
  }

  private embedModel(): string {
    return (
      this.config.get<string>('openai.embedModel') || 'text-embedding-3-small'
    );
  }

  private chatModel(): string {
    return this.config.get<string>('openai.chatModel') || 'gpt-4o-mini';
  }

  private chromaUrl(): string {
    return this.config.get<string>('chroma.url') || 'http://localhost:8000';
  }

  private collectionName(): string {
    return (
      this.config.get<string>('chroma.collection') || 'marea_recipe_chunks'
    );
  }

  private async ensureCollection(): Promise<Collection> {
    if (this.collection) return this.collection;

    const url = new URL(this.chromaUrl());
    const host = url.hostname || 'localhost';
    const port = url.port
      ? Number(url.port)
      : url.protocol === 'https:'
        ? 443
        : 8000;
    const ssl = url.protocol === 'https:';

    this.chroma = new ChromaClient({ host, port, ssl });

    // Embeddings are provided explicitly (OpenAI); this EF is only a Chroma SDK requirement.
    const embeddingFunction = {
      generate: async (texts: string[]): Promise<number[][]> => {
        if (!this.openai) {
          return texts.map(() => Array(1536).fill(0));
        }
        return this.embedTexts(texts);
      },
    };

    this.collection = await this.chroma.getOrCreateCollection({
      name: this.collectionName(),
      metadata: { source: 'marea-alta-recipes' },
      embeddingFunction,
    });
    return this.collection;
  }

  async embedTexts(texts: string[]): Promise<number[][]> {
    if (!this.openai) {
      throw new Error('OPENAI_API_KEY is not configured');
    }
    const model = this.embedModel();
    const t0 = Date.now();
    this.logger.debug(
      `[AI] embeddings.create model=${model} texts=${texts.length}`,
    );
    try {
      const res = await this.openai.embeddings.create({
        model,
        input: texts,
      });
      this.logger.debug(
        `[AI] embeddings.create ok in ${Date.now() - t0}ms (${res.data.length} vectors)`,
      );
      return res.data
        .sort((a, b) => a.index - b.index)
        .map((d) => d.embedding);
    } catch (err) {
      this.logger.error(
        `[AI] embeddings.create failed after ${Date.now() - t0}ms model=${model}`,
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }
  }

  async indexRecipe(recipeId: string): Promise<void> {
    const recipe = await this.recipes.findById(recipeId);
    if (!recipe) {
      this.logger.warn(`[AI] indexRecipe skipped — recipe ${recipeId} not found`);
      return;
    }

    this.logger.log(
      `[AI] indexRecipe start slug=${recipe.slug} status=${recipe.status}`,
    );

    // Always clear previous Chroma docs for this recipe
    await this.deleteRecipeFromChroma(recipeId).catch((err) => {
      this.logger.warn(
        `[AI] Chroma delete before reindex failed for ${recipe.slug}: ${
          err instanceof Error ? err.message : err
        }`,
      );
    });
    await this.recipes.deleteChunks(recipeId);

    if (recipe.status !== RecipeStatus.PUBLISHED) {
      this.logger.log(
        `[AI] indexRecipe skip embed — ${recipe.slug} is ${recipe.status} (chunks cleared)`,
      );
      return;
    }
    if (!this.openai) {
      this.logger.warn(
        `[AI] Skip embed for ${recipe.slug}: OPENAI_API_KEY missing`,
      );
      return;
    }

    const chunks = chunkRecipeForEmbed(recipe);
    if (!chunks.length) {
      this.logger.warn(`[AI] indexRecipe — no chunks for ${recipe.slug}`);
      return;
    }

    const t0 = Date.now();
    try {
      const embeddings = await this.embedTexts(chunks.map((c) => c.content));
      const collection = await this.ensureCollection();

      const ids: string[] = [];
      const documents: string[] = [];
      const metadatas: Record<string, string | number | boolean>[] = [];
      const embeddingsPayload: number[][] = [];

      for (let i = 0; i < chunks.length; i++) {
        const row = await this.recipes.createChunkRow({
          recipeId,
          chunkIndex: chunks[i].chunkIndex,
          content: chunks[i].content,
        });
        await this.recipes.setChunkChromaId(row.id, row.id);
        ids.push(row.id);
        documents.push(chunks[i].content);
        embeddingsPayload.push(embeddings[i]);
        metadatas.push({
          recipeId,
          slug: recipe.slug,
          name: recipe.name,
          category: recipe.category ?? '',
          chunkIndex: chunks[i].chunkIndex,
          status: recipe.status,
        });
      }

      await collection.upsert({
        ids,
        documents,
        embeddings: embeddingsPayload,
        metadatas,
      });

      this.logger.log(
        `[AI] Indexed ${chunks.length} chunks in Chroma for ${recipe.slug} in ${Date.now() - t0}ms`,
      );
    } catch (err) {
      this.logger.error(
        `[AI] indexRecipe failed for ${recipe.slug} after ${Date.now() - t0}ms`,
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }
  }

  async deleteRecipeFromChroma(recipeId: string): Promise<void> {
    const collection = await this.ensureCollection();
    await collection.delete({
      where: { recipeId },
    });
    this.logger.debug(`[AI] Chroma delete recipeId=${recipeId}`);
  }

  async retrieve(query: string, limit = 5): Promise<RetrievedChunk[]> {
    if (!this.openai) {
      this.logger.debug('[AI] retrieve skipped — OpenAI not configured');
      return [];
    }
    let collection: Collection;
    try {
      collection = await this.ensureCollection();
    } catch (err) {
      this.logger.warn(
        `[AI] Chroma unavailable for retrieve: ${
          err instanceof Error ? err.message : err
        }`,
      );
      return [];
    }

    const t0 = Date.now();
    const [embedding] = await this.embedTexts([query]);
    const result = await collection.query({
      queryEmbeddings: [embedding],
      nResults: limit,
      include: ['documents', 'metadatas', 'distances'],
    });

    const ids = result.ids?.[0] ?? [];
    const docs = result.documents?.[0] ?? [];
    const metas = result.metadatas?.[0] ?? [];
    const distances = result.distances?.[0] ?? [];

    const out: RetrievedChunk[] = [];
    for (let i = 0; i < ids.length; i++) {
      const meta = (metas[i] ?? {}) as Record<string, unknown>;
      out.push({
        id: ids[i],
        recipeId: String(meta.recipeId ?? ''),
        content: docs[i] ?? '',
        distance: distances[i] ?? 1,
        slug: String(meta.slug ?? ''),
        name: String(meta.name ?? ''),
        category: meta.category ? String(meta.category) : null,
      });
    }
    const filtered = out.filter((r) => r.slug && r.content);
    this.logger.debug(
      `[AI] Chroma query in ${Date.now() - t0}ms — raw=${ids.length} kept=${filtered.length}`,
    );
    return filtered;
  }

  async chatCompletion(system: string, user: string): Promise<string> {
    if (!this.openai) {
      throw new Error('OPENAI_API_KEY is not configured');
    }
    const model = this.chatModel();
    const t0 = Date.now();
    this.logger.debug(
      `[AI] chat.completions.create model=${model} userChars=${user.length}`,
    );
    try {
      const res = await this.openai.chat.completions.create({
        model,
        temperature: 0.4,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      });
      const content = res.choices[0]?.message?.content?.trim() || '';
      const usage = res.usage;
      this.logger.log(
        `[AI] chat.completions ok in ${Date.now() - t0}ms model=${model}` +
          (usage
            ? ` tokens in=${usage.prompt_tokens} out=${usage.completion_tokens} total=${usage.total_tokens}`
            : '') +
          ` finish=${res.choices[0]?.finish_reason ?? '?'}`,
      );
      return content;
    } catch (err) {
      this.logger.error(
        `[AI] chat.completions failed after ${Date.now() - t0}ms model=${model}`,
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }
  }
}
