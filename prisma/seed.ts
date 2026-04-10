import {
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

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

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
  const farm = await prisma.actor.upsert({
    where: { id: 'seed-farm-001' },
    update: {},
    create: {
      id: 'seed-farm-001',
      name: 'Hualtaco - El Oro',
      type: ActorType.FARM,
      location: 'El Oro, Ecuador',
      contact: 'granja@hualtaco.com',
    },
  });

  const lab = await prisma.actor.upsert({
    where: { id: 'seed-lab-001' },
    update: {},
    create: {
      id: 'seed-lab-001',
      name: 'Lardelmo - Manta',
      type: ActorType.LAB,
      location: 'Manta, Ecuador',
      contact: 'lab@lardelmo.com',
    },
  });

  const maturation = await prisma.actor.upsert({
    where: { id: 'seed-maturation-001' },
    update: {},
    create: {
      id: 'seed-maturation-001',
      name: 'Texcumar',
      type: ActorType.MATURATION,
      location: 'Ecuador',
    },
  });

  const coPacker = await prisma.actor.upsert({
    where: { id: 'seed-copacker-001' },
    update: {},
    create: {
      id: 'seed-copacker-001',
      name: 'Brisas del Mar',
      type: ActorType.CO_PACKER,
      location: 'Ecuador',
      contact: 'ops@brisasdelmar.com',
    },
  });

  // ── Product ────────────────────────────────────────────────────────────────
  const product = await prisma.product.upsert({
    where: { sku: 'CAMARON-MAREA-ALTA-COLA' },
    update: {},
    create: {
      sku: 'CAMARON-MAREA-ALTA-COLA',
      name: 'Camarón Premium "Marea Alta" (Cola)',
      description: 'Camarón Premium de exportación, presentación cola',
      category: 'Camarón',
    },
  });

  // ── Lots ───────────────────────────────────────────────────────────────────
  // Lot 1: P&D Tail Off / IQF — cosecha Feb 20 — 952 lbs
  const lot1 = await prisma.lot.upsert({
    where: { lotCode: 'P2-0226-PD-IQF-A' },
    update: {},
    create: {
      lotCode: 'P2-0226-PD-IQF-A',
      productId: product.id,
      presentation: Presentation.PD_TAIL_OFF,
      packaging: Packaging.IQF,
      weightKg: 2.27,
      sizeClassification: SizeClassification.S31_35,
      colorSalmoFan: ColorSalmoFan.A3,
      texture: 'Firme / Crujiente',
      certifications: ['SCI - GR-1823'],
      lotSizeLbs: 952,
      harvestDate: new Date('2026-02-20'),
      poolNumber: 2,
      harvestWeightGrams: 20.5,
      farmId: farm.id,
      labId: lab.id,
      maturationId: maturation.id,
      coPackerId: coPacker.id,
    },
  });

  // Lot 2: Shell On / Cajas — cosecha Feb 20 — 900 lbs
  const lot2 = await prisma.lot.upsert({
    where: { lotCode: 'P2-0226-SO-CBX' },
    update: {},
    create: {
      lotCode: 'P2-0226-SO-CBX',
      productId: product.id,
      presentation: Presentation.SHELL_ON,
      packaging: Packaging.CAJAS,
      weightKg: 2.27,
      sizeClassification: SizeClassification.S31_35,
      colorSalmoFan: ColorSalmoFan.A3,
      texture: 'Firme / Crujiente',
      certifications: ['SCI - GR-1823'],
      lotSizeLbs: 900,
      harvestDate: new Date('2026-02-20'),
      poolNumber: 2,
      harvestWeightGrams: 20.5,
      farmId: farm.id,
      labId: lab.id,
      maturationId: maturation.id,
      coPackerId: coPacker.id,
    },
  });

  // Lot 3: P&D Tail Off / IQF — cosecha Feb 26 — 655 lbs
  const lot3 = await prisma.lot.upsert({
    where: { lotCode: 'P2-0226-PD-IQF-B' },
    update: {},
    create: {
      lotCode: 'P2-0226-PD-IQF-B',
      productId: product.id,
      presentation: Presentation.PD_TAIL_OFF,
      packaging: Packaging.IQF,
      weightKg: 2.27,
      sizeClassification: SizeClassification.S31_35,
      colorSalmoFan: ColorSalmoFan.A4,
      texture: 'Firme / Crujiente',
      certifications: ['SCI - GR-1823'],
      lotSizeLbs: 655,
      harvestDate: new Date('2026-02-26'),
      poolNumber: 2,
      harvestWeightGrams: 23.5,
      farmId: farm.id,
      labId: lab.id,
      maturationId: maturation.id,
      coPackerId: coPacker.id,
    },
  });

  // ── Traceability events for Lot 1 (full chain example) ────────────────────
  const lot1Events = [
    {
      eventType: EventType.HARVESTED,
      actorId: farm.id,
      location: 'Hualtaco - El Oro, Piscina 2',
      notes: 'Cosecha exitosa, condiciones óptimas',
      metadata: { poolNumber: 2, harvestWeightGrams: 20.5, waterTemperature: '26°C' },
    },
    {
      eventType: EventType.TRANSPORTED,
      actorId: farm.id,
      location: 'Hualtaco → Manta',
      metadata: { vehiclePlate: 'ABC-1234', departureTemp: '4°C' },
    },
    {
      eventType: EventType.RECEIVED,
      actorId: lab.id,
      location: 'Lardelmo - Manta',
      notes: 'Recibido en buen estado, cadena de frío mantenida',
    },
    {
      eventType: EventType.QUALITY_CHECKED,
      actorId: lab.id,
      location: 'Lardelmo - Manta',
      notes: 'Control de calidad aprobado',
      metadata: { colorSalmoFan: 'A3', texture: 'Firme / Crujiente', inspector: 'QC Lab Lardelmo' },
    },
    {
      eventType: EventType.PROCESSED,
      actorId: coPacker.id,
      location: 'Brisas del Mar',
      notes: 'Proceso P&D Tail Off aplicado',
    },
    {
      eventType: EventType.PACKAGED,
      actorId: coPacker.id,
      location: 'Brisas del Mar',
      notes: 'Empaque IQF 2.27 Kg por unidad',
      metadata: { weightKg: 2.27 },
    },
    {
      eventType: EventType.STORED,
      actorId: coPacker.id,
      location: 'Cámara Fría — Brisas del Mar',
      metadata: { chamberNumber: 3, storageTemp: '-18°C' },
    },
  ];

  for (const event of lot1Events) {
    await prisma.traceabilityEvent.create({
      data: { lotId: lot1.id, ...event },
    });
  }

  console.log('\nSeed completo.');
  console.log('  Admin: admin@supply.com / admin123');
  console.log(`  Producto: ${product.name}`);
  console.log(`  Lotes: ${lot1.lotCode}, ${lot2.lotCode}, ${lot3.lotCode}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
