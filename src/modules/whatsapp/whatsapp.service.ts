import { Injectable, Logger } from '@nestjs/common';
import { maskPhone } from '../../common/pii.util';
import type {
  SendWhatsappResult,
  SendWhatsappTemplateArgs,
} from './whatsapp.types';
import { sanitizeWhatchimpTemplateParam } from './whatchimp-template-text.util';

function envFlag(name: string): boolean {
  return process.env[name] === 'true';
}

function readOptional(name: string): string {
  return process.env[name]?.trim() ?? '';
}

/**
 * HTTP client toward Notificador Bitflow (WhatChimp templates).
 * Same contract as ruta593 / Rotary Club NotificadorService.
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  isEnabled(): boolean {
    return envFlag('NOTIFICADOR_ENABLED');
  }

  hasBaseCredentials(): boolean {
    return Boolean(
      readOptional('NOTIFICADOR_BASE_URL') &&
        readOptional('NOTIFICADOR_API_KEY'),
    );
  }

  defaultTemplateId(): string | null {
    const id = readOptional('NOTIFICADOR_TEMPLATE_DEFAULT');
    return id || null;
  }

  paymentApprovedTemplateId(): string | null {
    const id = readOptional('NOTIFICADOR_TEMPLATE_PAYMENT_APPROVED');
    return id || this.defaultTemplateId();
  }

  isConfigured(): boolean {
    return this.hasBaseCredentials() && Boolean(this.defaultTemplateId());
  }

  async sendDefaultTemplate(
    args: Omit<SendWhatsappTemplateArgs, 'templateId'>,
  ): Promise<SendWhatsappResult> {
    const templateId = this.defaultTemplateId();
    if (!templateId) {
      throw new Error('NOTIFICADOR_TEMPLATE_DEFAULT no está definido');
    }
    return this.sendTemplate({ ...args, templateId });
  }

  async sendPaymentApprovedTemplate(
    args: Omit<SendWhatsappTemplateArgs, 'templateId'>,
  ): Promise<SendWhatsappResult> {
    const templateId = this.paymentApprovedTemplateId();
    if (!templateId) {
      throw new Error('NOTIFICADOR_TEMPLATE_DEFAULT no está definido');
    }
    return this.sendTemplate({ ...args, templateId });
  }

  async sendTemplate(
    args: SendWhatsappTemplateArgs,
  ): Promise<SendWhatsappResult> {
    const baseUrl = readOptional('NOTIFICADOR_BASE_URL');
    const apiKey = readOptional('NOTIFICADOR_API_KEY');
    const sendPath =
      readOptional('NOTIFICADOR_WHATSAPP_SEND_PATH') ||
      'whatchimp/messages/send-template-message';
    const timeoutMs = Number.parseInt(
      process.env.NOTIFICADOR_TIMEOUT_MS ?? '15000',
      10,
    );
    const phoneFormat = readOptional('NOTIFICADOR_PHONE_FORMAT') || 'plus';

    if (!baseUrl || !apiKey) {
      throw new Error(
        'Notificador no configurado: NOTIFICADOR_BASE_URL y NOTIFICADOR_API_KEY',
      );
    }
    if (!args.templateId.trim()) {
      throw new Error('templateId vacío');
    }

    const url = `${baseUrl.replace(/\/+$/, '')}/${sendPath.replace(/^\/+/, '')}`;
    const digits = args.phoneDigits.replace(/\D/g, '');
    const phoneNumber = phoneFormat === 'digits' ? digits : `+${digits}`;

    const contact = sanitizeWhatchimpTemplateParam(args.contact);
    const contentMessage = sanitizeWhatchimpTemplateParam(args.contentMessage);
    const contentMessageExt = sanitizeWhatchimpTemplateParam(
      args.contentMessageExt ?? '',
    );

    const payload = {
      templateId: args.templateId.trim(),
      phoneNumber,
      templateVariables: {
        contact,
        contentMessage,
        contentMessageExt,
      },
    };

    this.logger.log(
      `Notificador WhatsApp request POST ${url} to=${maskPhone(phoneNumber)} template=${payload.templateId}`,
    );

    const ac = new AbortController();
    const t = setTimeout(
      () => ac.abort(),
      Number.isFinite(timeoutMs) ? timeoutMs : 15_000,
    );

    try {
      const res = await fetch(url, {
        method: 'POST',
        signal: ac.signal,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      let body: unknown = null;
      if (text) {
        try {
          body = JSON.parse(text) as unknown;
        } catch {
          body = { raw: text };
        }
      }

      if (!res.ok) {
        this.logger.warn(
          `Notificador HTTP ${res.status} to=${maskPhone(phoneNumber)}: ${text.slice(0, 400)}`,
        );
      }

      return { ok: res.ok, status: res.status, body };
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        throw new Error('El notificador no respondió a tiempo');
      }
      throw e;
    } finally {
      clearTimeout(t);
    }
  }
}
