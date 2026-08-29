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
/** Cosine distance ceiling; weaker matches dropped. */
const RAG_MAX_DISTANCE = 0.75;
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
Prioriza presentaciones Marea Alta (cola PD, butterfly, shell-on, IQF) cuando encaje.`,
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
Prefer Marea Alta presentations (tail-on PD, butterfly, shell-on, IQF) when relevant.`,
  },
};

function selectChunks(hits: RetrievedChunk[]): RetrievedChunk[] {
  const tight = hits
    .filter((h) => h.distance <= RAG_MAX_DISTANCE)
    .slice(0, RAG_TOP_K);
  if (tight.length) return tight;
  // Fallback: still use best Chroma hits so Mary isn't empty-handed
  return hits.slice(0, Math.min(2, hits.length));
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

    // Over-fetch slightly, then distance-filter + truncate for the prompt
    const rawHits = await this.embeddings.retrieve(trimmed, RAG_TOP_K + 2);
    const hits = selectChunks(rawHits);
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
