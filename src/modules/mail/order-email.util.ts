export type OrderEmailLine = {
  name: string;
  sku: string;
  qty: number;
  listUnitPriceCents?: number;
  discountPercent?: number;
  promoDiscountPercent?: number;
  unitPriceCents: number;
};

export type OrderEmailBase = {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  customerAddress?: string | null;
  notes?: string | null;
  subtotalCents: number;
  listSubtotalCents?: number;
  discountTotalCents?: number;
  currency: string;
  items: OrderEmailLine[];
  fromName?: string | null;
};

export function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('es-EC', {
    style: 'currency',
    currency: currency || 'USD',
  }).format(cents / 100);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildPlainOrderSummary(
  payload: OrderEmailBase,
  header: string,
): string {
  return [
    header,
    `Pedido: ${payload.orderNumber}`,
    `Cliente: ${payload.customerName} <${payload.customerEmail}>`,
    payload.customerPhone ? `Tel: ${payload.customerPhone}` : '',
    payload.customerAddress ? `Dir: ${payload.customerAddress}` : '',
    payload.notes ? `Notas: ${payload.notes}` : '',
    '',
    ...payload.items.map((i) => {
      const unit = formatMoney(i.unitPriceCents, payload.currency);
      const base = i.discountPercent ?? 0;
      const promo = i.promoDiscountPercent ?? 0;
      const pct = Math.min(100, base + promo);
      const list = i.listUnitPriceCents;
      if (pct > 0 && list != null && list > i.unitPriceCents) {
        const breakdown =
          promo > 0 ? `−${pct}% (${base}%+${promo}% promo)` : `−${pct}%`;
        return `- ${i.name} (${i.sku}) x${i.qty} @ ${unit} (PVP ${formatMoney(list, payload.currency)}, ${breakdown})`;
      }
      return `- ${i.name} (${i.sku}) x${i.qty} @ ${unit}`;
    }),
    ...(payload.discountTotalCents && payload.discountTotalCents > 0
      ? [
          `Descuento total: −${formatMoney(payload.discountTotalCents, payload.currency)}`,
        ]
      : []),
    `Subtotal: ${formatMoney(payload.subtotalCents, payload.currency)}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** Shared responsive email shell (mobile-first, table-safe). */
export function wrapEmailDocument(options: {
  preheader: string;
  title: string;
  bodyHtml: string;
}): string {
  const preheader = escapeHtml(options.preheader);
  const title = escapeHtml(options.title);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${title}</title>
  <style>
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; }
      .stack { display: block !important; width: 100% !important; }
      .px-mobile { padding-left: 20px !important; padding-right: 20px !important; }
      .hero-title { font-size: 22px !important; line-height: 1.25 !important; }
      .item-row td { display: block !important; width: 100% !important; text-align: left !important; }
      .item-row .item-meta { padding-top: 0 !important; }
      .hide-mobile { display: none !important; max-height: 0 !important; overflow: hidden !important; }
      .btn-full { display: block !important; width: 100% !important; box-sizing: border-box !important; text-align: center !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" class="email-container" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          ${options.bodyHtml}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
