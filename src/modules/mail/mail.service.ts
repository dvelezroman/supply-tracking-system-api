import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import type { OrderEmailBase } from './order-email.util';
import {
  buildCustomerOrderEmail,
  type CustomerOrderEmailPayload,
} from './templates/marketplace-order-customer.template';
import { buildStoreOrderEmail } from './templates/marketplace-order-store.template';

export type { OrderEmailLine } from './order-email.util';

export type OrderEmailPayload = OrderEmailBase & {
  to: string;
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

  /** @deprecated Use sendMarketplaceOrderToStore — kept as alias for callers. */
  async sendMarketplaceOrder(payload: OrderEmailPayload): Promise<void> {
    return this.sendMarketplaceOrderToStore(payload);
  }

  async sendMarketplaceOrderToStore(payload: OrderEmailPayload): Promise<void> {
    const { html, text, subject } = buildStoreOrderEmail(payload);
    await this.sendHtml({
      to: payload.to,
      replyTo: payload.customerEmail,
      subject,
      html,
      text,
      fromName: payload.fromName,
    });
  }

  async sendMarketplaceOrderToCustomer(
    payload: CustomerOrderEmailPayload & { to: string },
  ): Promise<void> {
    const { html, text, subject } = buildCustomerOrderEmail(payload);
    await this.sendHtml({
      to: payload.to,
      subject,
      html,
      text,
      fromName: payload.fromName,
    });
  }

  private async sendHtml(options: {
    to: string;
    subject: string;
    html: string;
    text: string;
    fromName?: string | null;
    replyTo?: string;
  }): Promise<void> {
    if (!this.transporter) {
      throw new Error('SMTP is not configured');
    }

    const fromName = options.fromName?.trim() || 'Marea Alta Tienda';

    await this.transporter.sendMail({
      from: `"${fromName}" <${this.fromAddress}>`,
      to: options.to,
      replyTo: options.replyTo,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
  }
}
