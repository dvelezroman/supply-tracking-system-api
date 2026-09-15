import {
  buildPlainOrderSummary,
  escapeHtml,
  formatMoney,
  type OrderEmailBase,
  wrapEmailDocument,
} from '../order-email.util';

export function buildStoreOrderEmail(payload: OrderEmailBase): {
  html: string;
  text: string;
  subject: string;
} {
  const brand = payload.fromName?.trim() || 'Marea Alta Tienda';
  const orderRef = escapeHtml(payload.orderNumber);

  const itemRows = payload.items
    .map((i) => {
      const lineTotal = formatMoney(i.unitPriceCents * i.qty, payload.currency);
      const unit = formatMoney(i.unitPriceCents, payload.currency);
      return `<tr class="item-row">
        <td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;">
          <div style="font-size:15px;font-weight:600;color:#0f172a;line-height:1.35;">${escapeHtml(i.name)}</div>
          <div class="item-meta" style="font-size:12px;color:#64748b;margin-top:4px;">SKU ${escapeHtml(i.sku)}</div>
        </td>
        <td class="hide-mobile" style="padding:14px 8px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:14px;color:#334155;">${i.qty}</td>
        <td class="hide-mobile" style="padding:14px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:14px;color:#334155;">${unit}</td>
        <td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;text-align:right;white-space:nowrap;">
          <span class="hide-mobile" style="font-size:14px;font-weight:600;color:#0f172a;">${lineTotal}</span>
          <span style="display:none;font-size:14px;color:#64748b;" class="stack">Cant. ${i.qty} · ${unit} · </span>
          <span style="font-size:15px;font-weight:700;color:#0a2647;">${lineTotal}</span>
        </td>
      </tr>`;
    })
    .join('');

  const bodyHtml = `
          <tr>
            <td style="background:linear-gradient(135deg,#0a2647 0%,#144272 100%);border-radius:16px 16px 0 0;padding:28px 24px;" class="px-mobile">
              <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.75);margin-bottom:8px;">Nuevo pedido</div>
              <div class="hero-title" style="font-size:26px;font-weight:700;color:#ffffff;line-height:1.2;margin:0;">${orderRef}</div>
              <div style="font-size:14px;color:rgba(255,255,255,.85);margin-top:10px;line-height:1.5;">Solicitud desde la tienda en línea · ${escapeHtml(brand)}</div>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:24px;" class="px-mobile">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
                <tr>
                  <td style="padding:16px 18px;">
                    <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#64748b;margin-bottom:8px;">Datos del cliente</div>
                    <div style="font-size:16px;font-weight:600;color:#0f172a;">${escapeHtml(payload.customerName)}</div>
                    <div style="font-size:14px;color:#475569;margin-top:6px;line-height:1.55;">
                      <a href="mailto:${escapeHtml(payload.customerEmail)}" style="color:#144272;text-decoration:none;">${escapeHtml(payload.customerEmail)}</a>
                      ${payload.customerPhone ? `<br/>${escapeHtml(payload.customerPhone)}` : ''}
                      ${payload.customerAddress ? `<br/>${escapeHtml(payload.customerAddress)}` : ''}
                    </div>
                  </td>
                </tr>
              </table>
              ${
                payload.notes
                  ? `<p style="margin:16px 0 0;font-size:14px;line-height:1.55;color:#334155;"><strong style="color:#0f172a;">Notas:</strong> ${escapeHtml(payload.notes)}</p>`
                  : ''
              }
              <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#64748b;margin:24px 0 10px;">Productos</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
                <thead>
                  <tr class="hide-mobile" style="background:#f1f5f9;">
                    <th style="padding:10px 16px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.04em;">Producto</th>
                    <th style="padding:10px 8px;font-size:11px;color:#64748b;">Cant.</th>
                    <th style="padding:10px 8px;text-align:right;font-size:11px;color:#64748b;">Unit.</th>
                    <th style="padding:10px 16px;text-align:right;font-size:11px;color:#64748b;">Total</th>
                  </tr>
                </thead>
                <tbody>${itemRows}</tbody>
                <tfoot>
                  <tr style="background:#0a2647;">
                    <td colspan="3" style="padding:16px;font-size:14px;font-weight:600;color:#ffffff;text-align:right;">Subtotal</td>
                    <td style="padding:16px;font-size:18px;font-weight:700;color:#ffb4b4;text-align:right;">${formatMoney(payload.subtotalCents, payload.currency)}</td>
                  </tr>
                </tfoot>
              </table>
              <p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:#64748b;">Responde a este correo para contactar directamente al cliente (reply-to configurado).</p>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;border-radius:0 0 16px 16px;padding:0 24px 24px;" class="px-mobile">
              <div style="border-top:1px solid #e2e8f0;padding-top:16px;font-size:12px;color:#94a3b8;text-align:center;">${escapeHtml(brand)} · Notificación interna</div>
            </td>
          </tr>`;

  const html = wrapEmailDocument({
    preheader: `Nuevo pedido ${payload.orderNumber} de ${payload.customerName}`,
    title: `Pedido ${payload.orderNumber}`,
    bodyHtml,
  });

  return {
    html,
    text: buildPlainOrderSummary(payload, 'Nuevo pedido (tienda)'),
    subject: `[Marea Alta] Pedido ${payload.orderNumber}`,
  };
}
