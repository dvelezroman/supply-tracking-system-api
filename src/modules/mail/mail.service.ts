import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

export type OrderEmailLine = {
  name: string;
  sku: string;
  qty: number;
  unitPriceCents: number;
};

export type OrderEmailPayload = {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  customerAddress?: string | null;
  notes?: string | null;
  subtotalCents: number;
  currency: string;
  items: OrderEmailLine[];
  to: string;
  fromName?: string | null;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter | null;
  private readonly fromAddress: string;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('smtp.host') ?? '';
    const port = this.config.get<number>('smtp.port') ?? 587;
    const user = this.config.get<string>('smtp.user') ?? '';
    const pass = this.config.get<string>('smtp.pass') ?? '';
    this.fromAddress =
      this.config.get<string>('smtp.from')?.trim() ||
      this.config.get<string>('contactEmail')?.trim() ||
      'noreply@localhost';

    if (host) {
      const options: SMTPTransport.Options = {
        host,
        port,
        secure: port === 465,
        auth: user ? { user, pass } : undefined,
      };
      this.transporter = nodemailer.createTransport(options);
    } else {
      this.transporter = null;
      this.logger.warn('SMTP_HOST not configured — order emails will not be sent');
    }
  }

  isConfigured(): boolean {
    return this.transporter !== null;
  }

  async sendMarketplaceOrder(payload: OrderEmailPayload): Promise<void> {
    if (!this.transporter) {
      throw new Error('SMTP is not configured');
    }

    const fromName = payload.fromName?.trim() || 'Marea Alta Tienda';
    const linesHtml = payload.items
      .map(
        (i) =>
          `<tr>
            <td style="padding:8px;border-bottom:1px solid #e8ecf2;">${escapeHtml(i.name)}<br/><small>${escapeHtml(i.sku)}</small></td>
            <td style="padding:8px;border-bottom:1px solid #e8ecf2;text-align:center;">${i.qty}</td>
            <td style="padding:8px;border-bottom:1px solid #e8ecf2;text-align:right;">${formatMoney(i.unitPriceCents, payload.currency)}</td>
            <td style="padding:8px;border-bottom:1px solid #e8ecf2;text-align:right;">${formatMoney(i.unitPriceCents * i.qty, payload.currency)}</td>
          </tr>`,
      )
      .join('');

    const html = `
      <div style="font-family:Open Sans,Arial,sans-serif;color:#1a202c;max-width:640px;">
        <h2 style="color:#0a2647;margin:0 0 8px;">Nuevo pedido ${escapeHtml(payload.orderNumber)}</h2>
        <p style="color:#718096;margin:0 0 24px;">Solicitud desde la tienda Marea Alta</p>
        <h3 style="color:#144272;font-size:14px;text-transform:uppercase;letter-spacing:.04em;">Cliente</h3>
        <p style="margin:0 0 16px;line-height:1.5;">
          <strong>${escapeHtml(payload.customerName)}</strong><br/>
          ${escapeHtml(payload.customerEmail)}
          ${payload.customerPhone ? `<br/>${escapeHtml(payload.customerPhone)}` : ''}
          ${payload.customerAddress ? `<br/>${escapeHtml(payload.customerAddress)}` : ''}
        </p>
        ${
          payload.notes
            ? `<p style="margin:0 0 16px;"><strong>Notas:</strong> ${escapeHtml(payload.notes)}</p>`
            : ''
        }
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <thead>
            <tr style="background:#0a2647;color:#fff;">
              <th style="padding:8px;text-align:left;">Producto</th>
              <th style="padding:8px;">Cant.</th>
              <th style="padding:8px;text-align:right;">Unit.</th>
              <th style="padding:8px;text-align:right;">Total</th>
            </tr>
          </thead>
          <tbody>${linesHtml}</tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="padding:12px 8px;text-align:right;font-weight:700;">Subtotal</td>
              <td style="padding:12px 8px;text-align:right;font-weight:700;color:#ff6b6b;">
                ${formatMoney(payload.subtotalCents, payload.currency)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;

    await this.transporter.sendMail({
      from: `"${fromName}" <${this.fromAddress}>`,
      to: payload.to,
      replyTo: payload.customerEmail,
      subject: `[Marea Alta] Pedido ${payload.orderNumber}`,
      html,
      text: [
        `Pedido ${payload.orderNumber}`,
        `Cliente: ${payload.customerName} <${payload.customerEmail}>`,
        payload.customerPhone ? `Tel: ${payload.customerPhone}` : '',
        payload.customerAddress ? `Dir: ${payload.customerAddress}` : '',
        payload.notes ? `Notas: ${payload.notes}` : '',
        '',
        ...payload.items.map(
          (i) =>
            `- ${i.name} (${i.sku}) x${i.qty} @ ${formatMoney(i.unitPriceCents, payload.currency)}`,
        ),
        `Subtotal: ${formatMoney(payload.subtotalCents, payload.currency)}`,
      ]
        .filter(Boolean)
        .join('\n'),
    });
  }
}

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('es-EC', {
    style: 'currency',
    currency: currency || 'USD',
  }).format(cents / 100);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
