import { Injectable } from '@nestjs/common';
import { RecipeEmbeddingsService } from './recipe-embeddings.service';

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

const COPY: Record<
  ChatLang,
  {
    noKey: string;
    emptyContext: string;
    emptyReply: string;
    error: string;
    system: string;
    userPrefix: string;
    contextPrefix: string;
  }
> = {
  es: {
    noKey:
      'Mary aún no tiene conectada la IA (falta OPENAI_API_KEY). Mientras tanto puedes explorar /recetas o escribirnos por WhatsApp.',
    emptyContext: '(No hay recetas indexadas relevantes en la base.)',
    emptyReply:
      'No pude generar una respuesta ahora. Prueba el buscador de /recetas.',
    error:
      'Hubo un problema al consultar la IA. Puedes usar el buscador de recetas en /recetas.',
    system: `Eres Mary, asistenta de Marea Alta (camarón ecuatoriano con trazabilidad).
Responde en español, breve y útil. Usa SOLO el contexto de recetas recuperado.
Si el contexto no alcanza, dilo y sugiere buscar en /recetas o contactar por WhatsApp.
Cuando cites una receta, escribe la ruta exacta /recetas/{slug} (sin markdown ni asteriscos); el chat la convierte en enlace.
Prioriza presentaciones de camarón Marea Alta cuando encaje (cola, butterfly, shell-on, IQF).`,
    userPrefix: 'Pregunta del usuario:',
    contextPrefix: 'Contexto de recetas:',
  },
  en: {
    noKey:
      'Mary’s AI is not connected yet (missing OPENAI_API_KEY). Meanwhile you can browse /recetas or reach us on WhatsApp.',
    emptyContext: '(No relevant indexed recipes in the knowledge base.)',
    emptyReply:
      'I couldn’t generate a reply right now. Try the recipe search at /recetas.',
    error:
      'There was a problem reaching the AI. You can use the recipe search at /recetas.',
    system: `You are Mary, assistant for Marea Alta (Ecuadorian shrimp with traceability).
Reply in English, briefly and helpfully. Use ONLY the retrieved recipe context.
If the context is not enough, say so and suggest searching /recetas or contacting via WhatsApp.
When you cite a recipe, write the exact path /recetas/{slug} (no markdown or asterisks); the chat turns it into a link.
Prefer Marea Alta shrimp presentations when relevant (tail-on, butterfly, shell-on, IQF).`,
    userPrefix: 'User question:',
    contextPrefix: 'Recipe context:',
  },
};

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

    const hits = await this.embeddings.retrieve(trimmed, 5);
    const recipeRefs: ChatRecipeRef[] = [];
    const seen = new Set<string>();
    for (const h of hits) {
      if (seen.has(h.slug)) continue;
      seen.add(h.slug);
      recipeRefs.push({
        slug: h.slug,
        name: h.name,
        category: h.category,
      });
    }

    const context =
      hits.length === 0
        ? copy.emptyContext
        : hits
            .map(
              (h, i) =>
                `[${i + 1}] ${h.name} (slug: ${h.slug}, category: ${h.category ?? 'n/a'})\n${h.content}`,
            )
            .join('\n\n---\n\n');

    const system = copy.system;
    const user = `${copy.userPrefix}\n${trimmed}\n\n${copy.contextPrefix}\n${context}`;

    try {
      const reply = await this.embeddings.chatCompletion(system, user);
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
