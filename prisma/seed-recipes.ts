import {
  Prisma,
  PrismaClient,
  RecipeSourceType,
  RecipeStatus,
  Presentation,
} from '@prisma/client';
import { createHash } from 'crypto';

type SeedRecipe = {
  slug: string;
  name: string;
  category: string;
  ingredients: { name: string }[];
  description: string;
  techniques?: string[];
  suitablePresentations?: Presentation[];
};

const MOCK_RECIPES: SeedRecipe[] = [
  {
    slug: 'ceviche-de-camaron',
    name: 'Ceviche de Camarón',
    category: 'Entrada / Coctel',
    ingredients: [
      { name: 'Camarones' },
      { name: 'Limón' },
      { name: 'Cebolla morada' },
      { name: 'Cilantro' },
      { name: 'Tomate' },
    ],
    description:
      'Camarones cocidos y marinados en jugo de limón cítrico con vegetales frescos.',
    techniques: ['ceviche', 'marino'],
    suitablePresentations: [Presentation.PD_TAIL_OFF, Presentation.PD_TAIL_ON],
  },
  {
    slug: 'coctel-de-camarones-clasico',
    name: 'Coctel de Camarones Clásico',
    category: 'Entrada / Coctel',
    ingredients: [
      { name: 'Camarones' },
      { name: 'Salsa ketchup' },
      { name: 'Mayonesa' },
      { name: 'Salsa inglesa' },
      { name: 'Aguacate' },
    ],
    description:
      'Copa de camarones fríos servidos con una salsa rosada aderezada y trozos de aguacate.',
    techniques: ['frío', 'cóctel'],
    suitablePresentations: [Presentation.PD_TAIL_OFF, Presentation.PD_TAIL_ON],
  },
  {
    slug: 'aguachile-de-camaron',
    name: 'Aguachile de Camarón',
    category: 'Entrada / Coctel',
    ingredients: [
      { name: 'Camarones limpios' },
      { name: 'Jugo de limón' },
      { name: 'Chile serrano' },
      { name: 'Pepino' },
      { name: 'Cebolla morada' },
    ],
    description:
      'Camarones curtidos al momento en una mezcla intensa de limón y chiles picantes.',
    techniques: ['aguachile', 'crudo'],
    suitablePresentations: [Presentation.PD_TAIL_OFF],
  },
  {
    slug: 'camarones-al-ajillo',
    name: 'Camarones al Ajillo',
    category: 'Plato fuerte',
    ingredients: [
      { name: 'Camarones' },
      { name: 'Ajo' },
      { name: 'Aceite de oliva' },
      { name: 'Guindilla / Chile seco' },
      { name: 'Vino blanco' },
    ],
    description:
      'Platillo caliente donde los camarones se saltean rápidamente en abundante ajo y aceite perfumado.',
    techniques: ['salteado', 'ajillo'],
    suitablePresentations: [
      Presentation.PD_TAIL_ON,
      Presentation.SHELL_ON,
      Presentation.BUTTERFLY,
    ],
  },
  {
    slug: 'camarones-a-la-diabla',
    name: 'Camarones a la Diabla',
    category: 'Plato fuerte',
    ingredients: [
      { name: 'Camarones' },
      { name: 'Chile guajillo' },
      { name: 'Chile chipotle' },
      { name: 'Ajo' },
      { name: 'Puré de tomate' },
    ],
    description:
      'Camarones bañados en una salsa roja, tersa y altamente picante a base de chiles secos.',
    techniques: ['salsa', 'picante'],
    suitablePresentations: [Presentation.PD_TAIL_OFF, Presentation.PD_TAIL_ON],
  },
  {
    slug: 'arroz-con-camarones',
    name: 'Arroz con Camarones',
    category: 'Plato fuerte',
    ingredients: [
      { name: 'Camarones' },
      { name: 'Arroz' },
      { name: 'Pimiento' },
      { name: 'Cebolla' },
      { name: 'Achiote / Cúrcuma' },
    ],
    description:
      'Arroz sazonado y cocido junto con un sofrito de vegetales y camarones jugosos.',
    techniques: ['guiso', 'arroz'],
    suitablePresentations: [Presentation.PD_TAIL_OFF, Presentation.SHELL_ON],
  },
  {
    slug: 'tacos-de-camaron-ensenada',
    name: 'Tacos de Camarón Ensenada',
    category: 'Plato fuerte',
    ingredients: [
      { name: 'Camarones' },
      { name: 'Harina' },
      { name: 'Cerveza' },
      { name: 'Tortillas de maíz' },
      { name: 'Col rayada' },
    ],
    description:
      'Camarones rebozados en una mezcla crujiente de cerveza, fritos y servidos en tortillas.',
    techniques: ['frito', 'rebozado'],
    suitablePresentations: [Presentation.PD_TAIL_OFF, Presentation.BUTTERFLY],
  },
  {
    slug: 'camarones-en-salsa-de-coco',
    name: 'Camarones en Salsa de Coco',
    category: 'Plato fuerte',
    ingredients: [
      { name: 'Camarones' },
      { name: 'Leche de coco' },
      { name: 'Pimiento' },
      { name: 'Jengibre' },
      { name: 'Cilantro' },
    ],
    description:
      'Receta de influencia caribeña con una salsa cremosa, sutilmente dulce y aromática.',
    techniques: ['estofado', 'coco'],
    suitablePresentations: [Presentation.PD_TAIL_OFF, Presentation.PD_TAIL_ON],
  },
  {
    slug: 'pasta-alfredo-con-camarones',
    name: 'Pasta Alfredo con Camarones',
    category: 'Plato fuerte',
    ingredients: [
      { name: 'Camarones' },
      { name: 'Fettuccine' },
      { name: 'Crema de leche' },
      { name: 'Queso parmesano' },
      { name: 'Mantequilla' },
    ],
    description:
      'Pasta italiana bañada en una salsa blanca rica y cremosa, coronada con camarones salteados.',
    techniques: ['pasta', 'salteado'],
    suitablePresentations: [Presentation.PD_TAIL_OFF, Presentation.BUTTERFLY],
  },
  {
    slug: 'camarones-imperial-empanizados',
    name: 'Camarones Imperial (Empanizados)',
    category: 'Plato fuerte / Entrada',
    ingredients: [
      { name: 'Camarones' },
      { name: 'Pan molido / Panko' },
      { name: 'Huevo' },
      { name: 'Harina' },
      { name: 'Aceite para freír' },
    ],
    description:
      'Camarones crujientes por fuera y suaves por dentro, ideales para sumergir en salsas.',
    techniques: ['empanizado', 'frito'],
    suitablePresentations: [Presentation.BUTTERFLY, Presentation.PD_TAIL_ON],
  },
  {
    slug: 'brochetas-de-camaron-a-la-parilla',
    name: 'Brochetas de Camarón a la Parrilla',
    category: 'Plato fuerte / Entrada',
    ingredients: [
      { name: 'Camarones' },
      { name: 'Pimiento verde' },
      { name: 'Cebolla blanca' },
      { name: 'Piña' },
      { name: 'Salsa BBQ o Teriyaki' },
    ],
    description:
      'Brochetas intercaladas con marisco, vegetales y fruta, asadas al carbón o plancha.',
    techniques: ['parrilla', 'brocheta'],
    suitablePresentations: [Presentation.SHELL_ON, Presentation.PD_TAIL_ON],
  },
  {
    slug: 'encocado-de-camaron',
    name: 'Encocado de Camarón',
    category: 'Plato fuerte',
    ingredients: [
      { name: 'Camarones' },
      { name: 'Coco rallado fresco' },
      { name: 'Leche de coco' },
      { name: 'Chillangua / Culantro' },
      { name: 'Refrito verde' },
    ],
    description:
      'Estofado tradicional de la costa del Pacífico, cremoso y con un profundo sabor a coco y hierbas.',
    techniques: ['encocado', 'estofado'],
    suitablePresentations: [Presentation.SHELL_ON, Presentation.PD_TAIL_OFF],
  },
  {
    slug: 'camarones-kung-pao',
    name: 'Camarones Kung Pao',
    category: 'Plato fuerte',
    ingredients: [
      { name: 'Camarones' },
      { name: 'Cacahuates / Maní' },
      { name: 'Chiles secos' },
      { name: 'Salsa de soya' },
      { name: 'Calabacín' },
    ],
    description:
      'Plato de la gastronomía china que balancea sabores salados, dulces, ácidos y picantes.',
    techniques: ['wok', 'salteado'],
    suitablePresentations: [Presentation.PD_TAIL_OFF],
  },
  {
    slug: 'chupin-o-cazuela-de-camaron',
    name: 'Chupín o Cazuela de Camarón',
    category: 'Plato fuerte',
    ingredients: [
      { name: 'Camarones' },
      { name: 'Plátano verde' },
      { name: 'Pasta de maní' },
      { name: 'Caldo de pescado' },
      { name: 'Cebolla' },
    ],
    description:
      'Plato espeso cocinado tradicionalmente en vasija de barro a base de verde y maní.',
    techniques: ['cazuela', 'guiso'],
    suitablePresentations: [Presentation.SHELL_ON, Presentation.PD_TAIL_OFF],
  },
  {
    slug: 'risotto-de-camarones-y-esparragos',
    name: 'Risotto de Camarones y Espárragos',
    category: 'Plato fuerte',
    ingredients: [
      { name: 'Camarones' },
      { name: 'Arroz arbóreo' },
      { name: 'Caldo de mariscos' },
      { name: 'Espárragos' },
      { name: 'Vino blanco' },
    ],
    description:
      'Arroz italiano de textura cremosa logrado mediante la liberación de almidón y mantequilla.',
    techniques: ['risotto'],
    suitablePresentations: [Presentation.PD_TAIL_OFF, Presentation.BUTTERFLY],
  },
  {
    slug: 'camarones-en-salsa-de-tamarindo',
    name: 'Camarones en Salsa de Tamarindo',
    category: 'Plato fuerte / Acompañante',
    ingredients: [
      { name: 'Camarones' },
      { name: 'Pulpa de tamarindo' },
      { name: 'Azúcar morena' },
      { name: 'Ajo' },
      { name: 'Salsa de pescado' },
    ],
    description:
      'Una preparación con un perfil agridulce exótico muy popular en la cocina asiática.',
    techniques: ['agridulce', 'salsa'],
    suitablePresentations: [Presentation.PD_TAIL_ON, Presentation.PD_TAIL_OFF],
  },
  {
    slug: 'chop-suey-de-camarones',
    name: 'Chop Suey de Camarones',
    category: 'Plato fuerte',
    ingredients: [
      { name: 'Camarones' },
      { name: 'Brotes de soja' },
      { name: 'Zanahoria' },
      { name: 'Brócoli' },
      { name: 'Salsa de ostión' },
    ],
    description:
      'Salteado rápido de vegetales crujientes y camarones a fuego alto en un wok.',
    techniques: ['wok', 'salteado'],
    suitablePresentations: [Presentation.PD_TAIL_OFF],
  },
  {
    slug: 'gumbo-de-camaron',
    name: 'Gumbo de Camarón',
    category: 'Plato fuerte',
    ingredients: [
      { name: 'Camarones' },
      { name: 'Salchicha andouille' },
      { name: 'Ocra / Quimbombó' },
      { name: 'Roux oscuro' },
      { name: 'Apio' },
    ],
    description:
      'Sopa-estofado densa e intensamente sazonada, emblemática de la cocina criolla de Luisiana.',
    techniques: ['gumbo', 'estofado'],
    suitablePresentations: [Presentation.SHELL_ON, Presentation.PD_TAIL_OFF],
  },
  {
    slug: 'ceviche-dulce-de-camaron-con-mango',
    name: 'Ceviche Dulce de Camarón con Mango',
    category: 'Entrada / Transición',
    ingredients: [
      { name: 'Camarones' },
      { name: 'Mango maduro' },
      { name: 'Jugo de maracuyá' },
      { name: 'Menta picada' },
      { name: 'Cebolla morada' },
    ],
    description:
      'Variante fresca que juega en el límite de lo salado y lo dulce usando frutas tropicales.',
    techniques: ['ceviche', 'frutal'],
    suitablePresentations: [Presentation.PD_TAIL_OFF],
  },
];

function searchTextFor(r: SeedRecipe): string {
  return [
    r.name,
    r.description,
    r.category,
    ...(r.techniques ?? []),
    ...r.ingredients.map((i) => i.name),
  ].join('\n');
}

export async function seedRecipes(prisma: PrismaClient): Promise<number> {
  let count = 0;
  for (const r of MOCK_RECIPES) {
    const searchText = searchTextFor(r);
    const contentHash = createHash('sha256')
      .update(`SEED|${r.slug}|${r.name}`)
      .digest('hex');
    const steps: Prisma.InputJsonValue = [
      {
        order: 1,
        text: r.description,
      },
    ];
    await prisma.recipe.upsert({
      where: { slug: r.slug },
      create: {
        slug: r.slug,
        name: r.name,
        description: r.description,
        category: r.category,
        language: 'es',
        ingredients: r.ingredients,
        steps,
        techniques: r.techniques ?? [],
        tags: ['seed', 'camaron'],
        suitablePresentations: r.suitablePresentations ?? [],
        sourceType: RecipeSourceType.SEED,
        sourceName: 'Marea Alta seed',
        status: RecipeStatus.PUBLISHED,
        contentHash,
        searchText,
        publishedAt: new Date(),
        region: 'Costa Pacífico',
        cuisine: 'Latina',
      },
      update: {
        name: r.name,
        description: r.description,
        category: r.category,
        ingredients: r.ingredients,
        steps,
        techniques: r.techniques ?? [],
        suitablePresentations: r.suitablePresentations ?? [],
        searchText,
        status: RecipeStatus.PUBLISHED,
        publishedAt: new Date(),
      },
    });
    count += 1;
  }
  return count;
}
