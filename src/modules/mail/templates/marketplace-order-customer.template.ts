import {
  buildPlainOrderSummary,
  escapeHtml,
  formatMoney,
  type OrderEmailBase,
  wrapEmailDocument,
} from '../order-email.util';

export type CustomerOrderEmailPayload = OrderEmailBase & {
  orderConfirmationUrl: string;
};

export function buildCustomerOrderEmail(payload: CustomerOrderEmailPayload): {
  html: string;
  text: string;
  subject: string;
} {
  const brand = payload.fromName?.trim() || 'Marea Alta Tienda';
  const firstName = escapeHtml(payload.customerName.trim().split(/\s+/)[0] || payload.customerName);
  const orderRef = escapeHtml(payload.orderNumber);
  const confirmUrl = escapeHtml(payload.orderConfirmationUrl);

  const itemCards = payload.items
    .map((i) => {
      const lineTotal = formatMoney(i.unitPriceCents * i.qty, payload.currency);
      const unit = formatMoney(i.unitPriceCents, payload.currency);
      return `<tr>
        <td style="padding:0 0 10px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
            <tr>
              <td style="padding:14px 16px;">
                <div style="font-size:15px;font-weight:600;color:#0f172a;line-height:1.35;">${escapeHtml(i.name)}</div>
                <div style="font-size:12px;color:#64748b;margin-top:4px;">${i.qty} × ${unit}</div>
                <div style="font-size:16px;font-weight:700;color:#0a2647;margin-top:10px;">${lineTotal}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
    })
    .join('');

  const bodyHtml = `
          <tr>
            <td style="background:linear-gradient(135deg,#0a2647 0%,#144272 100%);border-radius:16px 16px 0 0;padding:32px 24px;text-align:center;" class="px-mobile">
              <div style="width:48px;height:48px;margin:0 auto 16px;background:rgba(255,255,255,.15);border-radius:50%;line-height:48px;font-size:22px;">✓</div>
              <div class="hero-title" style="font-size:24px;font-weight:700;color:#ffffff;line-height:1.25;margin:0;">¡Gracias, ${firstName}!</div>
              <div style="font-size:15px;color:rgba(255,255,255,.9);margin-top:12px;line-height:1.5;">Recibimos tu pedido y ya lo estamos revisando.</div>
              <div style="display:inline-block;margin-top:18px;padding:8px 14px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);border-radius:999px;font-size:13px;font-weight:600;color:#ffffff;letter-spacing:.02em;">Pedido ${orderRef}</div>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:24px;" class="px-mobile">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;margin-bottom:20px;">
                <tr>
                  <td style="padding:14px 16px;font-size:14px;line-height:1.55;color:#065f46;">
                    <strong>¿Qué sigue?</strong> Nuestro equipo confirmará disponibilidad y coordinará contigo el pago y la entrega. Si necesitas aclarar algo, responde a este correo.
                  </td>
                </tr>
              </table>
              <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#64748b;margin:0 0 12px;">Tu pedido</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${itemCards}</table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">
                <tr>
                  <td style="padding:16px;background:#0a2647;border-radius:12px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-size:14px;font-weight:600;color:rgba(255,255,255,.85);">Subtotal</td>
                        <td style="font-size:20px;font-weight:700;color:#ffb4b4;text-align:right;">${formatMoney(payload.subtotalCents, payload.currency)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              ${
                payload.notes
                  ? `<p style="margin:16px 0 0;font-size:14px;line-height:1.55;color:#475569;"><strong style="color:#0f172a;">Tus notas:</strong> ${escapeHtml(payload.notes)}</p>`
                  : ''
              }
              ${
                payload.customerAddress
                  ? `<p style="margin:12px 0 0;font-size:14px;line-height:1.55;color:#475569;"><strong style="color:#0f172a;">Entrega:</strong> ${escapeHtml(payload.customerAddress)}</p>`
                  : ''
              }
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
                <tr>
                  <td align="center">
                    <a href="${confirmUrl}" class="btn-full" style="display:inline-block;padding:14px 28px;background:#ff6b6b;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;box-shadow:0 4px 14px rgba(255,107,107,.35);">Ver detalle del pedido</a>
                  </td>
                </tr>
              </table>
              <p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#94a3b8;text-align:center;">Guarda este enlace para consultar el estado cuando quieras.</p>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;border-radius:0 0 16px 16px;padding:0 24px 28px;" class="px-mobile">
              <div style="border-top:1px solid #e2e8f0;padding-top:20px;text-align:center;">
                <div style="font-size:13px;font-weight:600;color:#334155;">${escapeHtml(brand)}</div>
                <div style="font-size:12px;color:#94a3b8;margin-top:6px;line-height:1.5;">Productos del mar, con trazabilidad.</div>
              </div>
            </td>
          </tr>`;

  const html = wrapEmailDocument({
    preheader: `Confirmación pedido ${payload.orderNumber} — ${formatMoney(payload.subtotalCents, payload.currency)}`,
    title: `Tu pedido ${payload.orderNumber}`,
    bodyHtml,
  });

  const textLines = [
    buildPlainOrderSummary(payload, 'Confirmación de pedido'),
    '',
    `Ver pedido: ${payload.orderConfirmationUrl}`,
    '',
    'Nuestro equipo te contactará para confirmar pago y entrega.',
  ];

  return {
    html,
    text: textLines.join('\n'),
    subject: `[${brand}] Confirmación de pedido ${payload.orderNumber}`,
  };
}
