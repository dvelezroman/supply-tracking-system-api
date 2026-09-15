import { Injectable } from '@nestjs/common';
import {
  RecipeEmbeddingsService,
  RetrievedChunk,
} from './recipe-embeddings.service';

export type ChatLang = 'es' | 'en';

export type ChatRecipeRef = {
  slug: string;
  name: string;
  category: string | null;
};

export type ChatResponse = {
  reply: string;
  recipeRefs: ChatRecipeRef[];
  ragEnabled: boolean;
};

/** Fewer Chroma hits → fewer prompt tokens. */
const RAG_TOP_K = 3;
/** Extra Chroma rows so we can diversify by recipe. */
const RAG_OVERFETCH = 4;
/** Cosine distance ceiling; weaker matches dropped. */
const RAG_MAX_DISTANCE = 0.75;
/** Hits within this band of the best distance may be lightly shuffled. */
const RAG_NEAR_TIE_BAND = 0.05;
/** Cap each chunk body in the prompt. */
const RAG_MAX_CHUNK_CHARS = 480;
/** Cap model reply length. */
const CHAT_MAX_TOKENS = 180;

const COPY: Record<
  ChatLang,
  {
    noKey: string;
    emptyContext: string;
    emptyReply: string;
    error: string;
    system: string;
  }
> = {
  es: {
    noKey:
      'IA no conectada (falta OPENAI_API_KEY). Explora /recetas o WhatsApp.',
    emptyContext: '(Sin chunks relevantes en Chroma.)',
    emptyReply: 'Sin respuesta. Prueba /recetas.',
    error: 'Error de IA. Usa /recetas o WhatsApp.',
    system: `Mary, Marea Alta. Español. Máx 3–4 frases cortas.
Usa SOLO los chunks RAG. Cita datos (cantidades, pasos, presentación) si vienen en el contexto.
Rutas: /recetas/{slug} (sin markdown). Si falta info: /recetas o WhatsApp.
Prioriza presentaciones Marea Alta (cola PD, butterfly, shell-on, IQF) cuando encaje.
Cuando hay varias recetas en el contexto, menciona al menos dos distintas si encajan.`,
  },
  en: {
    noKey:
      'AI offline (missing OPENAI_API_KEY). Try /recetas or WhatsApp.',
    emptyContext: '(No relevant Chroma chunks.)',
    emptyReply: 'No reply. Try /recetas.',
    error: 'AI error. Use /recetas or WhatsApp.',
    system: `Mary, Marea Alta. English. Max 3–4 short sentences.
Use ONLY the RAG chunks. Cite amounts/steps/presentation when present in context.
Paths: /recetas/{slug} (no markdown). If missing info: /recetas or WhatsApp.
Prefer Marea Alta presentations (tail-on PD, butterfly, shell-on, IQF) when relevant.
When several recipes are in context, mention at least two distinct ones if they fit.`,
  },
};

/** Deterministic PRNG from string (message + minute bucket). */
function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(arr: T[], rand: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/** One chunk per recipe, then light shuffle among near-distance ties. */
function selectChunks(
  hits: RetrievedChunk[],
  diversitySeed: string,
): RetrievedChunk[] {
  const byRecipe: RetrievedChunk[] = [];
  const seen = new Set<string>();
  for (const h of hits) {
    const key = h.recipeId || h.slug;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    byRecipe.push(h);
  }

  const within = byRecipe.filter((h) => h.distance <= RAG_MAX_DISTANCE);
  const pool = within.length ? within : byRecipe.slice(0, Math.min(2, byRecipe.length));
  if (pool.length <= 1) return pool.slice(0, RAG_TOP_K);

  const best = Math.min(...pool.map((h) => h.distance));
  const near = pool.filter((h) => h.distance - best <= RAG_NEAR_TIE_BAND);
  const rest = pool.filter((h) => h.distance - best > RAG_NEAR_TIE_BAND);

  const rand = mulberry32(hashSeed(diversitySeed));
  shuffleInPlace(near, rand);

  return [...near, ...rest].slice(0, RAG_TOP_K);
}

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function formatContext(hits: RetrievedChunk[]): string {
  return hits
    .map(
      (h, i) =>
        `[${i + 1}] ${h.name} | /recetas/${h.slug}\n${truncate(
          h.content,
          RAG_MAX_CHUNK_CHARS,
        )}`,
    )
    .join('\n\n');
}

function uniqueRefs(hits: RetrievedChunk[]): ChatRecipeRef[] {
  const refs: ChatRecipeRef[] = [];
  const seen = new Set<string>();
  for (const h of hits) {
    if (!h.slug || seen.has(h.slug)) continue;
    seen.add(h.slug);
    refs.push({
      slug: h.slug,
      name: h.name,
      category: h.category,
    });
  }
  return refs;
}

@Injectable()
export class RecipeChatService {
  constructor(private readonly embeddings: RecipeEmbeddingsService) {}

  async chat(message: string, lang: ChatLang = 'es'): Promise<ChatResponse> {
    const locale = lang === 'en' ? 'en' : 'es';
    const copy = COPY[locale];
    const trimmed = message.trim();

    if (!this.embeddings.isConfigured()) {
      return {
        reply: copy.noKey,
        recipeRefs: [],
        ragEnabled: false,
      };
    }

    const minuteBucket = Math.floor(Date.now() / 60_000);
    const diversitySeed = `${trimmed}|${minuteBucket}`;

    // Over-fetch, then diversify (1 chunk/recipe) + near-tie shuffle
    const rawHits = await this.embeddings.retrieve(
      trimmed,
      RAG_TOP_K + RAG_OVERFETCH,
    );
    const hits = selectChunks(rawHits, diversitySeed);
    const recipeRefs = uniqueRefs(hits);

    const context =
      hits.length === 0 ? copy.emptyContext : formatContext(hits);

    const user = `Q: ${trimmed}\n\nRAG:\n${context}`;

    try {
      const reply = await this.embeddings.chatCompletion(copy.system, user, {
        maxTokens: CHAT_MAX_TOKENS,
      });
      return {
        reply: reply || copy.emptyReply,
        recipeRefs,
        ragEnabled: true,
      };
    } catch {
      return {
        reply: copy.error,
        recipeRefs,
        ragEnabled: true,
      };
    }
  }
}
