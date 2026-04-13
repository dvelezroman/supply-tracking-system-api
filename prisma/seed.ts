import {
  Prisma,
  PrismaClient,
  ActorType,
  UserRole,
  EventType,
  Presentation,
  Packaging,
  SizeClassification,
  ColorSalmoFan,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as QRCode from 'qrcode';

const prisma = new PrismaClient();

/**
 * Idempotent seed: **upsert only** (no `delete` / `deleteMany`). Safe to re-run; it
 * reconciles known rows by natural keys (`email`, `id`, `sku`, `lotCode`, event `id`).
 */

/** Same pattern as API `LotsService` / landing — must match `FRONTEND_URL` for scannable QRs. */
function publicTraceUrlForSeed(lotCode: string): string {
  const base = (process.env.FRONTEND_URL ?? 'http://localhost:4200').replace(/\/$/, '');
  return `${base}/trace/${encodeURIComponent(lotCode)}`;
}

async function traceQrArtifacts(lotCode: string): Promise<{
  publicTraceUrl: string;
  qrCodeDataUrl: string;
}> {
  const publicTraceUrl = publicTraceUrlForSeed(lotCode);
  const qrCodeDataUrl = await QRCode.toDataURL(publicTraceUrl, {
    width: 300,
    margin: 2,
    color: { dark: '#1a237e', light: '#ffffff' },
  });
  return { publicTraceUrl, qrCodeDataUrl };
}

/** UTC: start of calendar day for harvest (lot.harvestDate alignment). */
function utcDay(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

function addHours(base: Date, hours: number): Date {
  return new Date(base.getTime() + hours * 60 * 60 * 1000);
}

type SeedEvent = {
  eventType: EventType;
  actorKey: 'farm' | 'lab' | 'maturation' | 'coPacker' | 'distributor' | 'retailer';
  location?: string;
  notes?: string;
  metadata?: Prisma.InputJsonValue;
  offsetHours: number;
};

const ACTOR_SEEDS = [
  {
    key: 'farm' as const,
    id: 'seed-farm-001',
    name: 'Hualtaco - El Oro',
    type: ActorType.FARM,
    location: 'El Oro, Ecuador',
    contact: 'granja@hualtaco.com',
  },
  {
    key: 'lab' as const,
    id: 'seed-lab-001',
    name: 'Lardelmo - Manta',
    type: ActorType.LAB,
    location: 'Manta, Ecuador',
    contact: 'lab@lardelmo.com',
  },
  {
    key: 'maturation' as const,
    id: 'seed-maturation-001',
    name: 'Texcumar',
    type: ActorType.MATURATION,
    location: 'Ecuador',
    contact: undefined as string | undefined,
  },
  {
    key: 'coPacker' as const,
    id: 'seed-copacker-001',
    name: 'Marea Alta',
    type: ActorType.CO_PACKER,
    location: 'Ecuador',
    contact: 'ops@brisasdelmar.com',
  },
  {
    key: 'distributor' as const,
    id: 'seed-distributor-001',
    name: 'Cold Chain Logistics EC',
    type: ActorType.DISTRIBUTOR,
    location: 'Guayaquil, Ecuador',
    contact: 'dispatch@ccl-ec.com',
  },
  {
    key: 'retailer' as const,
    id: 'seed-retailer-001',
    name: 'Supermercados del Pacífico',
    type: ActorType.RETAILER,
    location: 'Manta & Quito',
    contact: 'b2b@pacifico.ec',
  },
];

async function main() {
  console.log('Seeding database (upserts only)...');

  // ── Users ──────────────────────────────────────────────────────────────────
  const adminPassword = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { email: 'admin@supply.com' },
    update: {},
    create: {
      email: 'admin@supply.com',
      password: adminPassword,
      name: 'Admin User',
      role: UserRole.ADMIN,
    },
  });

  // ── Actors ─────────────────────────────────────────────────────────────────
  type ActorKey = (typeof ACTOR_SEEDS)[number]['key'];
  const actors = {} as Record<ActorKey, { id: string }>;
  for (const a of ACTOR_SEEDS) {
    const row = await prisma.actor.upsert({
      where: { id: a.id },
      update: {
        name: a.name,
        type: a.type,
        location: a.location,
        contact: a.contact ?? null,
      },
      create: {
        id: a.id,
        name: a.name,
        type: a.type,
        location: a.location,
        contact: a.contact,
      },
    });
    actors[a.key] = row;
  }

  const farm = actors.farm;
  const lab = actors.lab;
  const maturation = actors.maturation;
  const coPacker = actors.coPacker;
  const distributor = actors.distributor;
  const retailer = actors.retailer;

  // ── Products ───────────────────────────────────────────────────────────────
  const productDefs = [
    {
      sku: 'CAMARON-MAREA-ALTA-COLA',
      name: 'Camarón Premium "Marea Alta" (Cola)',
      description: 'Camarón Premium de exportación, presentación cola',
      category: 'Camarón',
    },
    {
      sku: 'CAMARON-BUTTERFLY-IQF',
      name: 'Camarón Butterfly IQF — Marea Alta',
      description: 'Corte mariposa, IQF, ideal food service',
      category: 'Camarón',
    },
    {
      sku: 'CAMARON-SHELL-ON-BOX',
      name: 'Camarón Shell On caja 4.5 kg',
      description: 'Entero con caparazón, empaque caja',
      category: 'Camarón',
    },
    {
      sku: 'FILETE-SALMON-ATLANTICO',
      name: 'Filete salmón atlántico trim D',
      description: 'Producto complementario — trazabilidad demo',
      category: 'Salmón',
    },
  ] as const;

  const products: Record<string, { id: string; sku: string; name: string }> = {};
  for (const p of productDefs) {
    const row = await prisma.product.upsert({
      where: { sku: p.sku },
      update: { name: p.name, description: p.description, category: p.category },
      create: {
        sku: p.sku,
        name: p.name,
        description: p.description,
        category: p.category,
      },
    });
    products[p.sku] = row;
  }

  // ── Lots (lotCode unique) ─────────────────────────────────────────────────
  type LotSeed = {
    lotCode: string;
    productSku: keyof typeof products;
    presentation: Presentation;
    packaging: Packaging;
    weightKg: number;
    sizeClassification: SizeClassification;
    colorSalmoFan: ColorSalmoFan;
    texture: string;
    certifications: string[];
    lotSizeLbs: number;
    harvestY: number;
    harvestM: number;
    harvestD: number;
    poolNumber: number;
    harvestWeightGrams: number;
  };

  const lotSeeds: LotSeed[] = [
    {
      lotCode: 'P2-0226-PD-IQF-A',
      productSku: 'CAMARON-MAREA-ALTA-COLA',
      presentation: Presentation.PD_TAIL_OFF,
      packaging: Packaging.IQF,
      weightKg: 2.27,
      sizeClassification: SizeClassification.S31_35,
      colorSalmoFan: ColorSalmoFan.A3,
      texture: 'Firme / Crujiente',
      certifications: ['SCI - GR-1823'],
      lotSizeLbs: 952,
      harvestY: 2026,
      harvestM: 2,
      harvestD: 20,
      poolNumber: 2,
      harvestWeightGrams: 20.5,
    },
    {
      lotCode: 'P2-0226-SO-CBX',
      productSku: 'CAMARON-SHELL-ON-BOX',
      presentation: Presentation.SHELL_ON,
      packaging: Packaging.CAJAS,
      weightKg: 2.27,
      sizeClassification: SizeClassification.S31_35,
      colorSalmoFan: ColorSalmoFan.A3,
      texture: 'Firme / Crujiente',
      certifications: ['SCI - GR-1823'],
      lotSizeLbs: 900,
      harvestY: 2026,
      harvestM: 2,
      harvestD: 20,
      poolNumber: 2,
      harvestWeightGrams: 20.5,
    },
    {
      lotCode: 'P2-0226-PD-IQF-B',
      productSku: 'CAMARON-MAREA-ALTA-COLA',
      presentation: Presentation.PD_TAIL_OFF,
      packaging: Packaging.IQF,
      weightKg: 2.27,
      sizeClassification: SizeClassification.S31_35,
      colorSalmoFan: ColorSalmoFan.A4,
      texture: 'Firme / Crujiente',
      certifications: ['SCI - GR-1823'],
      lotSizeLbs: 655,
      harvestY: 2026,
      harvestM: 2,
      harvestD: 26,
      poolNumber: 2,
      harvestWeightGrams: 23.5,
    },
    {
      lotCode: 'P3-0326-BF-IQF-01',
      productSku: 'CAMARON-BUTTERFLY-IQF',
      presentation: Presentation.BUTTERFLY,
      packaging: Packaging.IQF,
      weightKg: 1.8,
      sizeClassification: SizeClassification.S26_30,
      colorSalmoFan: ColorSalmoFan.A2,
      texture: 'Firme',
      certifications: ['SCI - GR-1823'],
      lotSizeLbs: 1100,
      harvestY: 2026,
      harvestM: 3,
      harvestD: 5,
      poolNumber: 3,
      harvestWeightGrams: 22.0,
    },
    {
      lotCode: 'P3-0326-BF-IQF-02',
      productSku: 'CAMARON-BUTTERFLY-IQF',
      presentation: Presentation.BUTTERFLY,
      packaging: Packaging.IQF,
      weightKg: 1.8,
      sizeClassification: SizeClassification.S26_30,
      colorSalmoFan: ColorSalmoFan.A3,
      texture: 'Firme',
      certifications: ['SCI - GR-1823'],
      lotSizeLbs: 880,
      harvestY: 2026,
      harvestM: 3,
      harvestD: 18,
      poolNumber: 3,
      harvestWeightGrams: 21.5,
    },
    {
      lotCode: 'P1-0126-SO-CBX-01',
      productSku: 'CAMARON-SHELL-ON-BOX',
      presentation: Presentation.SHELL_ON,
      packaging: Packaging.CAJAS,
      weightKg: 4.5,
      sizeClassification: SizeClassification.S36_40,
      colorSalmoFan: ColorSalmoFan.A3,
      texture: 'Firme',
      certifications: ['ASC'],
      lotSizeLbs: 2000,
      harvestY: 2026,
      harvestM: 1,
      harvestD: 12,
      poolNumber: 1,
      harvestWeightGrams: 19.0,
    },
    {
      lotCode: 'SAL-0126-FIL-D-01',
      productSku: 'FILETE-SALMON-ATLANTICO',
      presentation: Presentation.PD_TAIL_OFF,
      packaging: Packaging.IQF,
      weightKg: 0.25,
      sizeClassification: SizeClassification.S21_25,
      colorSalmoFan: ColorSalmoFan.A2,
      texture: 'Firme',
      certifications: [],
      lotSizeLbs: 5000,
      harvestY: 2026,
      harvestM: 1,
      harvestD: 8,
      poolNumber: 1,
      harvestWeightGrams: 180,
    },
    {
      lotCode: 'SAL-0226-FIL-D-02',
      productSku: 'FILETE-SALMON-ATLANTICO',
      presentation: Presentation.PD_TAIL_OFF,
      packaging: Packaging.IQF,
      weightKg: 0.25,
      sizeClassification: SizeClassification.S21_25,
      colorSalmoFan: ColorSalmoFan.A3,
      texture: 'Firme',
      certifications: [],
      lotSizeLbs: 4200,
      harvestY: 2026,
      harvestM: 2,
      harvestD: 14,
      poolNumber: 1,
      harvestWeightGrams: 175,
    },
  ];

  const lots: { id: string; lotCode: string; harvestDay: Date }[] = [];

  for (const L of lotSeeds) {
    const harvestDate = utcDay(L.harvestY, L.harvestM, L.harvestD);
    const productId = products[L.productSku].id;
    const { publicTraceUrl, qrCodeDataUrl } = await traceQrArtifacts(L.lotCode);

    const lotUpdate = {
      productId,
      presentation: L.presentation,
      packaging: L.packaging,
      weightKg: L.weightKg,
      sizeClassification: L.sizeClassification,
      colorSalmoFan: L.colorSalmoFan,
      texture: L.texture,
      certifications: L.certifications,
      lotSizeLbs: L.lotSizeLbs,
      harvestDate,
      poolNumber: L.poolNumber,
      harvestWeightGrams: L.harvestWeightGrams,
      farmId: farm.id,
      labId: lab.id,
      maturationId: maturation.id,
      coPackerId: coPacker.id,
      publicTraceUrl,
      qrCodeDataUrl,
    } as unknown as Prisma.LotUncheckedUpdateInput;

    const lotCreate = {
      lotCode: L.lotCode,
      productId,
      presentation: L.presentation,
      packaging: L.packaging,
      weightKg: L.weightKg,
      sizeClassification: L.sizeClassification,
      colorSalmoFan: L.colorSalmoFan,
      texture: L.texture,
      certifications: L.certifications,
      lotSizeLbs: L.lotSizeLbs,
      harvestDate,
      poolNumber: L.poolNumber,
      harvestWeightGrams: L.harvestWeightGrams,
      farmId: farm.id,
      labId: lab.id,
      maturationId: maturation.id,
      coPackerId: coPacker.id,
      publicTraceUrl,
      qrCodeDataUrl,
    } as unknown as Prisma.LotUncheckedCreateInput;

    const lot = await prisma.lot.upsert({
      where: { lotCode: L.lotCode },
      update: lotUpdate,
      create: lotCreate,
    });
    lots.push({ id: lot.id, lotCode: lot.lotCode, harvestDay: harvestDate });
  }

  /** Realistic chain: harvest morning → logistics → lab QC → processing → pack (empaque) → cold store → ship → retail delivery. */
  function eventsForLot(
    harvestDay: Date,
    variant: 'shrimp-standard' | 'shrimp-fast' | 'salmon',
  ): SeedEvent[] {
    const base = harvestDay;
    if (variant === 'salmon') {
      return [
        {
          eventType: EventType.CREATED,
          actorKey: 'farm',
          location: 'Registro de lote',
          notes: 'Lote creado en sistema',
          offsetHours: -2,
        },
        {
          eventType: EventType.HARVESTED,
          actorKey: 'farm',
          location: 'Centro acuícola',
          notes: 'Recepción materia prima',
          metadata: { waterTemperature: '8°C' },
          offsetHours: 7,
        },
        {
          eventType: EventType.TRANSPORTED,
          actorKey: 'distributor',
          location: 'Planta → procesamiento',
          metadata: { vehiclePlate: 'XYZ-9001', departureTemp: '2°C' },
          offsetHours: 14,
        },
        {
          eventType: EventType.PROCESSED,
          actorKey: 'coPacker',
          location: 'Planta fileteado IQF',
          notes: 'Trim D, IQF',
          offsetHours: 30,
        },
        {
          eventType: EventType.PACKAGED,
          actorKey: 'coPacker',
          location: 'Línea empaque IQF',
          notes: 'Empaque retail',
          metadata: { weightKg: 0.25 },
          offsetHours: 38,
        },
        {
          eventType: EventType.STORED,
          actorKey: 'coPacker',
          location: 'Cámara -18°C',
          metadata: { chamberNumber: 1, storageTemp: '-18°C' },
          offsetHours: 42,
        },
        {
          eventType: EventType.SHIPPED,
          actorKey: 'distributor',
          location: 'Salida a distribución nacional',
          metadata: { vehiclePlate: 'XYZ-9002' },
          offsetHours: 90,
        },
        {
          eventType: EventType.DELIVERED,
          actorKey: 'retailer',
          location: 'CD Retailer Quito',
          offsetHours: 120,
        },
      ];
    }

    if (variant === 'shrimp-fast') {
      return [
        {
          eventType: EventType.HARVESTED,
          actorKey: 'farm',
          location: 'Hualtaco - El Oro, Piscina',
          notes: 'Cosecha',
          metadata: { poolNumber: 3, harvestWeightGrams: 22, waterTemperature: '26°C' },
          offsetHours: 6,
        },
        {
          eventType: EventType.TRANSPORTED,
          actorKey: 'farm',
          location: 'Granja → Texcumar',
          metadata: { vehiclePlate: 'SHR-4401', departureTemp: '4°C' },
          offsetHours: 10,
        },
        {
          eventType: EventType.RECEIVED,
          actorKey: 'maturation',
          location: 'Texcumar',
          notes: 'Recepción en planta de maduración',
          offsetHours: 14,
        },
        {
          eventType: EventType.TRANSPORTED,
          actorKey: 'maturation',
          location: 'Texcumar → Manta',
          metadata: { vehiclePlate: 'SHR-4402' },
          offsetHours: 26,
        },
        {
          eventType: EventType.RECEIVED,
          actorKey: 'lab',
          location: 'Lardelmo - Manta',
          offsetHours: 30,
        },
        {
          eventType: EventType.QUALITY_CHECKED,
          actorKey: 'lab',
          location: 'Lardelmo - Manta',
          notes: 'QC aprobado',
          offsetHours: 38,
        },
        {
          eventType: EventType.PROCESSED,
          actorKey: 'coPacker',
          location: 'Marea Alta',
          offsetHours: 46,
        },
        {
          eventType: EventType.PACKAGED,
          actorKey: 'coPacker',
          location: 'Marea Alta — empaque IQF',
          notes: 'Empaque y etiquetado',
          offsetHours: 54,
        },
        {
          eventType: EventType.STORED,
          actorKey: 'coPacker',
          location: 'Cámara fría Marea Alta',
          metadata: { storageTemp: '-18°C' },
          offsetHours: 58,
        },
        {
          eventType: EventType.SHIPPED,
          actorKey: 'distributor',
          location: 'CCL EC — export / nacional',
          offsetHours: 80,
        },
        {
          eventType: EventType.DELIVERED,
          actorKey: 'retailer',
          location: 'Red de tiendas',
          offsetHours: 110,
        },
      ];
    }

    return [
      {
        eventType: EventType.HARVESTED,
        actorKey: 'farm',
        location: 'Hualtaco - El Oro, Piscina 2',
        notes: 'Cosecha exitosa, condiciones óptimas',
        metadata: { poolNumber: 2, harvestWeightGrams: 20.5, waterTemperature: '26°C' },
        offsetHours: 6,
      },
      {
        eventType: EventType.TRANSPORTED,
        actorKey: 'farm',
        location: 'Hualtaco → Manta',
        metadata: { vehiclePlate: 'ABC-1234', departureTemp: '4°C' },
        offsetHours: 11,
      },
      {
        eventType: EventType.RECEIVED,
        actorKey: 'lab',
        location: 'Lardelmo - Manta',
        notes: 'Recibido en buen estado, cadena de frío mantenida',
        offsetHours: 15,
      },
      {
        eventType: EventType.QUALITY_CHECKED,
        actorKey: 'lab',
        location: 'Lardelmo - Manta',
        notes: 'Control de calidad aprobado',
        metadata: {
          colorSalmoFan: 'A3',
          texture: 'Firme / Crujiente',
          inspector: 'QC Lab Lardelmo',
        },
        offsetHours: 22,
      },
      {
        eventType: EventType.PROCESSED,
        actorKey: 'coPacker',
        location: 'Marea Alta',
        notes: 'Proceso según especificación de lote',
        offsetHours: 36,
      },
      {
        eventType: EventType.PACKAGED,
        actorKey: 'coPacker',
        location: 'Marea Alta',
        notes: 'Empaque según presentación del lote',
        metadata: { line: 'IQF / cajas' },
        offsetHours: 44,
      },
      {
        eventType: EventType.STORED,
        actorKey: 'coPacker',
        location: 'Cámara Fría — Marea Alta',
        metadata: { chamberNumber: 3, storageTemp: '-18°C' },
        offsetHours: 48,
      },
      {
        eventType: EventType.SHIPPED,
        actorKey: 'distributor',
        location: 'Guayaquil — hub logístico',
        metadata: { vehiclePlate: 'CCL-7788' },
        offsetHours: 72,
      },
      {
        eventType: EventType.DELIVERED,
        actorKey: 'retailer',
        location: 'Supermercados del Pacífico — CD',
        notes: 'Entrega a centro de distribución',
        offsetHours: 96,
      },
    ];
  }

  const lotVariant = new Map<string, 'shrimp-standard' | 'shrimp-fast' | 'salmon'>([
    ['P2-0226-PD-IQF-A', 'shrimp-standard'],
    ['P2-0226-SO-CBX', 'shrimp-standard'],
    ['P2-0226-PD-IQF-B', 'shrimp-fast'],
    ['P3-0326-BF-IQF-01', 'shrimp-fast'],
    ['P3-0326-BF-IQF-02', 'shrimp-standard'],
    ['P1-0126-SO-CBX-01', 'shrimp-standard'],
    ['SAL-0126-FIL-D-01', 'salmon'],
    ['SAL-0226-FIL-D-02', 'salmon'],
  ]);

  for (const lot of lots) {
    const variant = lotVariant.get(lot.lotCode) ?? 'shrimp-standard';
    const chain = eventsForLot(lot.harvestDay, variant);
    for (let idx = 0; idx < chain.length; idx++) {
      const ev = chain[idx]!;
      const ts = addHours(lot.harvestDay, ev.offsetHours);
      const eventId = `seed-ev-${lot.lotCode}-${idx}`;
      await prisma.traceabilityEvent.upsert({
        where: { id: eventId },
        update: {
          lotId: lot.id,
          actorId: actors[ev.actorKey].id,
          eventType: ev.eventType,
          location: ev.location,
          notes: ev.notes,
          metadata: ev.metadata ?? Prisma.JsonNull,
          timestamp: ts,
        },
        create: {
          id: eventId,
          lotId: lot.id,
          actorId: actors[ev.actorKey].id,
          eventType: ev.eventType,
          location: ev.location,
          notes: ev.notes,
          metadata: ev.metadata ?? undefined,
          timestamp: ts,
        },
      });
    }
  }

  console.log('\nSeed completo (upserts only).');
  console.log('  Admin: admin@supply.com / admin123');
  console.log(`  Productos: ${productDefs.length}`);
  for (const def of productDefs) {
    const n = await prisma.lot.count({ where: { product: { sku: def.sku } } });
    console.log(`    · ${def.sku}: ${n} lote(s)`);
  }
  console.log(`  Lotes totales: ${lots.length} (${lots.map((l) => l.lotCode).join(', ')})`);
  console.log(
    '  Cada lote tiene publicTraceUrl + qrCodeDataUrl (QR apunta a /trace/:lotCode en el front).',
  );
  console.log('\n  Prueba desde el celular (mismo enlace que codifica el QR):');
  for (const L of lotSeeds) {
    console.log(`    · ${L.lotCode} → ${publicTraceUrlForSeed(L.lotCode)}`);
  }
  console.log(
    `  FRONTEND_URL=${process.env.FRONTEND_URL ?? 'http://localhost:4200'} — si el móvil no alcanza localhost, usa la IP de tu PC (ej. http://192.168.1.10:4200) y vuelve a ejecutar el seed o exporta FRONTEND_URL antes.`,
  );
  console.log(
    '  API (PNG): GET /api/v0/lots/code/<LOT_CODE>/qr  — PDF: .../qr/pdf?copies=30',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
