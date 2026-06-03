/**
 * Backfill retail label fields on products that have NULLs.
 * Safe to run multiple times (only fills missing columns).
 *
 * Usage: npx ts-node prisma/backfill-retail-labels.ts
 */
import { PrismaClient } from '@prisma/client';
import { RETAIL_LABEL_SKU_DEFAULTS } from '../src/common/label/retail-label.resolve';

const prisma = new PrismaClient();

async function main() {
  const products = await prisma.product.findMany({
    select: {
      id: true,
      sku: true,
      name: true,
      labelTitle: true,
      labelGtin13: true,
      labelNetWeightOz: true,
      labelNetWeightLbs: true,
      labelSanitaryArcsa: true,
    },
  });

  let updated = 0;
  for (const p of products) {
    const defaults = RETAIL_LABEL_SKU_DEFAULTS[p.sku];
    if (!defaults) {
      console.log(`  skip ${p.sku} (no catalog defaults — configure via API or env)`);
      continue;
    }

    const data: {
      labelTitle?: string;
      labelGtin13?: string;
      labelNetWeightOz?: number;
      labelNetWeightLbs?: number;
      labelSanitaryArcsa?: string;
    } = {};

    if (!p.labelTitle) data.labelTitle = defaults.labelTitle;
    if (!p.labelGtin13) data.labelGtin13 = defaults.labelGtin13;
    if (p.labelNetWeightOz == null) data.labelNetWeightOz = defaults.labelNetWeightOz;
    if (p.labelNetWeightLbs == null) data.labelNetWeightLbs = defaults.labelNetWeightLbs;
    if (!p.labelSanitaryArcsa) data.labelSanitaryArcsa = defaults.labelSanitaryArcsa ?? 'En trámite';

    if (Object.keys(data).length === 0) {
      console.log(`  ok   ${p.sku} (already complete)`);
      continue;
    }

    await prisma.product.update({ where: { id: p.id }, data });
    updated++;
    console.log(`  fill ${p.sku} → ${Object.keys(data).join(', ')}`);
  }

  console.log(`\nDone. Updated ${updated} product(s).`);
  console.log('Ensure LABEL_OWNER_RUC is set in API .env before printing retail labels.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
