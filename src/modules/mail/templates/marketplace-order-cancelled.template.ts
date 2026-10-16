import {
  buildPlainOrderSummary,
  escapeHtml,
  formatMoney,
  type OrderEmailBase,
  wrapEmailDocument,
} from '../order-email.util';

export type CustomerOrderCancelledEmailPayload = OrderEmailBase & {
  orderConfirmationUrl: string;
  /** True when order had confirmed payment before cancellation. */
  wasPaid: boolean;
};

export function buildCustomerOrderCancelledEmail(
  payload: CustomerOrderCancelledEmailPayload,
): {
  html: string;
  text: string;
  subject: string;
} {
  const brand = payload.fromName?.trim() || 'Marea Alta Tienda';
  const firstName = escapeHtml(
    payload.customerName.trim().split(/\s+/)[0] || payload.customerName,
  );
  const orderRef = escapeHtml(payload.orderNumber);
  const confirmUrl = escapeHtml(payload.orderConfirmationUrl);

  const mainCopy = payload.wasPaid
    ? 'Tu pedido fue cancelado. Si ya realizaste el pago, nuestro equipo se pondrá en contacto contigo para coordinar el reembolso o una alternativa.'
    : 'Tu pedido fue cancelado y ya no está en proceso. Si tienes dudas, responde a este correo.';

  const bodyHtml = `
          <tr>
            <td style="background:linear-gradient(135deg,#7f1d1d 0%,#991b1b 100%);border-radius:16px 16px 0 0;padding:32px 24px;text-align:center;" class="px-mobile">
              <div style="width:48px;height:48px;margin:0 auto 16px;background:rgba(255,255,255,.15);border-radius:50%;line-height:48px;font-size:22px;">✕</div>
              <div class="hero-title" style="font-size:24px;font-weight:700;color:#ffffff;line-height:1.25;margin:0;">Pedido cancelado</div>
              <div style="font-size:15px;color:rgba(255,255,255,.9);margin-top:12px;line-height:1.5;">Hola, ${firstName}. Lamentamos informarte sobre el pedido ${orderRef}.</div>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:24px;" class="px-mobile">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;margin-bottom:20px;">
                <tr>
                  <td style="padding:14px 16px;font-size:14px;line-height:1.55;color:#991b1b;">
                    ${mainCopy}
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:14px;line-height:1.55;color:#475569;">
                Subtotal del pedido: <strong style="color:#0f172a;">${formatMoney(payload.subtotalCents, payload.currency)}</strong>
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
                <tr>
                  <td align="center">
                    <a href="${confirmUrl}" class="btn-full" style="display:inline-block;padding:14px 28px;background:#0a2647;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;">Ver estado del pedido</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;border-radius:0 0 16px 16px;padding:0 24px 28px;" class="px-mobile">
              <div style="border-top:1px solid #e2e8f0;padding-top:20px;text-align:center;">
                <div style="font-size:13px;font-weight:600;color:#334155;">${escapeHtml(brand)}</div>
              </div>
            </td>
          </tr>`;

  const html = wrapEmailDocument({
    preheader: `Pedido ${payload.orderNumber} cancelado`,
    title: `Pedido cancelado ${payload.orderNumber}`,
    bodyHtml,
  });

  const text = [
    buildPlainOrderSummary(payload, 'Pedido cancelado'),
    '',
    mainCopy,
    '',
    `Ver pedido: ${payload.orderConfirmationUrl}`,
  ].join('\n');

  return {
    html,
    text,
    subject: `[${brand}] Pedido cancelado — ${payload.orderNumber}`,
  };
}
