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
    await this.ensureCollection().catch((err) => {
      this.logger.warn(
        `ChromaDB not ready yet (${err instanceof Error ? err.message : err}). RAG indexing deferred until Chroma is up.`,
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
    const res = await this.openai.embeddings.create({
      model: this.embedModel(),
      input: texts,
    });
    return res.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  }

  async indexRecipe(recipeId: string): Promise<void> {
    const recipe = await this.recipes.findById(recipeId);
    if (!recipe) return;

    // Always clear previous Chroma docs for this recipe
    await this.deleteRecipeFromChroma(recipeId).catch(() => undefined);
    await this.recipes.deleteChunks(recipeId);

    if (recipe.status !== RecipeStatus.PUBLISHED) {
      return;
    }
    if (!this.openai) {
      this.logger.warn(
        `Skip embed for ${recipe.slug}: OPENAI_API_KEY missing`,
      );
      return;
    }

    const chunks = chunkRecipeForEmbed(recipe);
    if (!chunks.length) return;

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
      `Indexed ${chunks.length} chunks in Chroma for recipe ${recipe.slug}`,
    );
  }

  async deleteRecipeFromChroma(recipeId: string): Promise<void> {
    const collection = await this.ensureCollection();
    await collection.delete({
      where: { recipeId },
    });
  }

  async retrieve(query: string, limit = 5): Promise<RetrievedChunk[]> {
    if (!this.openai) return [];
    let collection: Collection;
    try {
      collection = await this.ensureCollection();
    } catch {
      this.logger.warn('Chroma unavailable for retrieve');
      return [];
    }

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
    return out.filter((r) => r.slug && r.content);
  }

  async chatCompletion(system: string, user: string): Promise<string> {
    if (!this.openai) {
      throw new Error('OPENAI_API_KEY is not configured');
    }
    const res = await this.openai.chat.completions.create({
      model: this.chatModel(),
      temperature: 0.4,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
    return res.choices[0]?.message?.content?.trim() || '';
  }
}
