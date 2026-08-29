import { Injectable } from '@nestjs/common';
import { RecipeEmbeddingsService } from './recipe-embeddings.service';

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

@Injectable()
export class RecipeChatService {
  constructor(private readonly embeddings: RecipeEmbeddingsService) {}

  async chat(message: string): Promise<ChatResponse> {
    const trimmed = message.trim();
    if (!this.embeddings.isConfigured()) {
      return {
        reply:
          'Mary aún no tiene conectada la IA (falta OPENAI_API_KEY). Mientras tanto puedes explorar /recetas o escribirnos por WhatsApp.',
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
        ? '(No hay recetas indexadas relevantes en la base.)'
        : hits
            .map(
              (h, i) =>
                `[${i + 1}] ${h.name} (slug: ${h.slug}, categoría: ${h.category ?? 'n/a'})\n${h.content}`,
            )
            .join('\n\n---\n\n');

    const system = `Eres Mary, asistenta de Marea Alta (camarón ecuatoriano con trazabilidad).
Responde en español, breve y útil. Usa SOLO el contexto de recetas recuperado.
Si el contexto no alcanza, dilo y sugiere buscar en /recetas o contactar por WhatsApp.
Cuando cites una receta, menciona su nombre y slug para que el usuario pueda abrir /recetas/{slug}.
Prioriza presentaciones de camarón Marea Alta cuando encaje (cola, butterfly, shell-on, IQF).`;

    const user = `Pregunta del usuario:\n${trimmed}\n\nContexto de recetas:\n${context}`;

    try {
      const reply = await this.embeddings.chatCompletion(system, user);
      return {
        reply:
          reply ||
          'No pude generar una respuesta ahora. Prueba el buscador de /recetas.',
        recipeRefs,
        ragEnabled: true,
      };
    } catch {
      return {
        reply:
          'Hubo un problema al consultar la IA. Puedes usar el buscador de recetas en /recetas.',
        recipeRefs,
        ragEnabled: true,
      };
    }
  }
}
