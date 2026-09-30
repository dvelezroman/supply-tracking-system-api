export type OrderEmailLine = {
  name: string;
  sku: string;
  qty: number;
  listUnitPriceCents?: number;
  discountPercent?: number;
  promoDiscountPercent?: number;
  unitPriceCents: number;
};

export type BankTransferEmailDetails = {
  bankName: string;
  bankAccountType: string;
  bankAccountNumber: string;
  bankBeneficiaryName: string;
  bankBeneficiaryRuc: string;
  bankContactEmail?: string | null;
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
  taxCents?: number;
  totalCents?: number;
  currency: string;
  items: OrderEmailLine[];
  fromName?: string | null;
  paymentMethod?: 'EMAIL' | 'PAYPAL' | 'BANK_TRANSFER' | 'CARD' | string;
  /** When true, email is a post-payment confirmation. */
  paymentConfirmed?: boolean;
  emailKind?: 'ORDER_REQUEST' | 'ORDER_PAID' | 'PAYMENT_FAILED';
  authorizationCode?: string;
  payphoneTransactionId?: string;
  bankTransfer?: BankTransferEmailDetails | null;
};

export function buildBankTransferInstructionsHtml(
  payload: OrderEmailBase,
): string {
  if (payload.paymentMethod !== 'BANK_TRANSFER' || !payload.bankTransfer) {
    return '';
  }
  const b = payload.bankTransfer;
  const amount = formatMoney(payload.subtotalCents, payload.currency);
  const rows = [
    ['Banco', b.bankName],
    ['Tipo de cuenta', b.bankAccountType],
    ['Número de cuenta', b.bankAccountNumber],
    ['Beneficiario', b.bankBeneficiaryName],
    ['RUC', b.bankBeneficiaryRuc],
    ['Monto', amount],
    ['Referencia', payload.orderNumber],
  ];
  if (b.bankContactEmail) {
    rows.push(['Comprobante a', b.bankContactEmail]);
  }
  const rowHtml = rows
    .map(
      ([label, value]) => `<tr>
        <td style="padding:6px 0;font-size:13px;color:#64748b;width:40%;">${escapeHtml(label)}</td>
        <td style="padding:6px 0;font-size:14px;font-weight:600;color:#0f172a;">${escapeHtml(value)}</td>
      </tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;margin:16px 0 0;">
    <tr>
      <td style="padding:14px 16px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#1d4ed8;margin-bottom:8px;">Transferencia bancaria</div>
        <p style="margin:0 0 10px;font-size:13px;line-height:1.5;color:#1e3a8a;">Transfiera el monto exacto y use el número de pedido como referencia.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowHtml}</table>
      </td>
    </tr>
  </table>`;
}

export function buildBankTransferInstructionsText(
  payload: OrderEmailBase,
): string {
  if (payload.paymentMethod !== 'BANK_TRANSFER' || !payload.bankTransfer) {
    return '';
  }
  const b = payload.bankTransfer;
  const lines = [
    '--- Transferencia bancaria ---',
    `Banco: ${b.bankName}`,
    `Tipo: ${b.bankAccountType}`,
    `Cuenta: ${b.bankAccountNumber}`,
    `Beneficiario: ${b.bankBeneficiaryName}`,
    `RUC: ${b.bankBeneficiaryRuc}`,
    `Monto: ${formatMoney(payload.subtotalCents, payload.currency)}`,
    `Referencia: ${payload.orderNumber}`,
  ];
  if (b.bankContactEmail) {
    lines.push(`Comprobante a: ${b.bankContactEmail}`);
  }
  return lines.join('\n');
}

/**
 * One-line bank summary for WhatsApp WhatChimp params (caller truncates).
 */
export function buildBankTransferWhatsappSummaryLine(
  payload: Pick<
    OrderEmailBase,
    'orderNumber' | 'subtotalCents' | 'currency' | 'paymentMethod' | 'bankTransfer'
  >,
): string {
  if (payload.paymentMethod !== 'BANK_TRANSFER' || !payload.bankTransfer) {
    return '';
  }
  const b = payload.bankTransfer;
  return [
    b.bankName,
    `Cta ${b.bankAccountNumber}`,
    formatMoney(payload.subtotalCents, payload.currency),
    `Ref ${payload.orderNumber}`,
  ].join(' · ');
}

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
    ...(payload.taxCents && payload.taxCents > 0
      ? [`IVA: ${formatMoney(payload.taxCents, payload.currency)}`]
      : []),
    ...(payload.totalCents &&
    payload.totalCents > 0 &&
    payload.totalCents !== payload.subtotalCents
      ? [`Total: ${formatMoney(payload.totalCents, payload.currency)}`]
      : []),
    payload.authorizationCode
      ? `Autorización: ${payload.authorizationCode}`
      : '',
    payload.payphoneTransactionId
      ? `Transacción Payphone: ${payload.payphoneTransactionId}`
      : '',
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
