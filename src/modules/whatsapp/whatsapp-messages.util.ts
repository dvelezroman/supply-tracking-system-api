import {
  buildBankTransferWhatsappSummaryLine,
  formatMoney,
  type BankTransferEmailDetails,
} from '../mail/order-email.util';
import { truncateTemplateParam } from './whatchimp-template-text.util';

export const WHATSAPP_CONTENT_MESSAGE_MAX_LENGTH = 80;
export const WHATSAPP_CONTENT_MESSAGE_EXT_MAX_LENGTH = 120;
/** Bank transfer details mirror email; need more room than generic ext copy. */
export const WHATSAPP_BANK_TRANSFER_SUMMARY_MAX_LENGTH = 1024;

export type WhatsappTemplateCopy = {
  contact: string;
  contentMessage: string;
  contentMessageExt: string;
};

function moneyUsd(cents: number, currency = 'USD'): string {
  return formatMoney(cents, currency);
}

function shortOrderId(orderNumber: string): string {
  return orderNumber.slice(-8).toUpperCase();
}

function paymentMethodLabel(method?: string | null): string {
  switch (method) {
    case 'BANK_TRANSFER':
      return 'Transferencia';
    case 'PAYPAL':
      return 'PayPal';
    case 'CARD':
      return 'Tarjeta';
    case 'EMAIL':
      return 'Offline';
    default:
      return method?.trim() || 'Pago';
  }
}

/** Bank transfer summary for WhatChimp contentMessageExt (same fields as order email). */
export function buildBankTransferWhatsappSummary(args: {
  orderNumber: string;
  subtotalCents: number;
  currency?: string;
  paymentMethod?: string | null;
  bankTransfer?: BankTransferEmailDetails | null;
}): string {
  return truncateTemplateParam(
    buildBankTransferWhatsappSummaryLine({
      orderNumber: args.orderNumber,
      subtotalCents: args.subtotalCents,
      currency: args.currency ?? 'USD',
      paymentMethod: args.paymentMethod ?? undefined,
      bankTransfer: args.bankTransfer,
    }),
    WHATSAPP_BANK_TRANSFER_SUMMARY_MAX_LENGTH,
  );
}

export function buildMarketplacePendingAdminCopy(args: {
  adminName?: string | null;
  customerName: string;
  orderNumber: string;
  subtotalCents: number;
  currency?: string;
  paymentMethod?: string | null;
}): WhatsappTemplateCopy {
  const method = paymentMethodLabel(args.paymentMethod);
  return {
    contact: truncateTemplateParam(args.adminName?.trim() || 'Ops', 40),
    contentMessage: truncateTemplateParam(
      `Pedido pendiente (${method}).`,
      WHATSAPP_CONTENT_MESSAGE_MAX_LENGTH,
    ),
    contentMessageExt: truncateTemplateParam(
      `${args.customerName} · #${shortOrderId(args.orderNumber)} · ${moneyUsd(args.subtotalCents, args.currency)}`,
      WHATSAPP_CONTENT_MESSAGE_EXT_MAX_LENGTH,
    ),
  };
}

export function buildMarketplaceOrderReceivedCustomerCopy(args: {
  customerName: string;
  orderNumber: string;
  paymentMethod?: string | null;
  bankTransfer?: BankTransferEmailDetails | null;
  subtotalCents: number;
  currency?: string;
  confirmationUrl?: string | null;
}): WhatsappTemplateCopy {
  const contact = truncateTemplateParam(
    args.customerName.trim().split(/\s+/)[0] || args.customerName || 'Cliente',
    40,
  );
  const method = args.paymentMethod;

  if (method === 'BANK_TRANSFER' && args.bankTransfer) {
    return {
      contact,
      contentMessage: truncateTemplateParam(
        `Pedido recibido #${shortOrderId(args.orderNumber)}.`,
        WHATSAPP_CONTENT_MESSAGE_MAX_LENGTH,
      ),
      contentMessageExt: buildBankTransferWhatsappSummary({
        orderNumber: args.orderNumber,
        subtotalCents: args.subtotalCents,
        currency: args.currency ?? 'USD',
        paymentMethod: 'BANK_TRANSFER',
        bankTransfer: args.bankTransfer,
      }),
    };
  }

  if (method === 'PAYPAL') {
    return {
      contact,
      contentMessage: truncateTemplateParam(
        `Pedido #${shortOrderId(args.orderNumber)} recibido.`,
        WHATSAPP_CONTENT_MESSAGE_MAX_LENGTH,
      ),
      contentMessageExt: truncateTemplateParam(
        args.confirmationUrl
          ? `Completa el pago en PayPal. ${args.confirmationUrl}`
          : `Completa el pago en PayPal · ${moneyUsd(args.subtotalCents, args.currency)}`,
        WHATSAPP_CONTENT_MESSAGE_EXT_MAX_LENGTH,
      ),
    };
  }

  return {
    contact,
    contentMessage: truncateTemplateParam(
      `Pedido #${shortOrderId(args.orderNumber)} recibido.`,
      WHATSAPP_CONTENT_MESSAGE_MAX_LENGTH,
    ),
    contentMessageExt: truncateTemplateParam(
      args.confirmationUrl
        ? `Coordinaremos el pago. Detalle: ${args.confirmationUrl}`
        : `Coordinaremos el pago · ${moneyUsd(args.subtotalCents, args.currency)}`,
      WHATSAPP_CONTENT_MESSAGE_EXT_MAX_LENGTH,
    ),
  };
}

export function buildMarketplaceOrderCancelledCustomerCopy(args: {
  customerName: string;
  orderNumber: string;
  subtotalCents: number;
  currency?: string;
  confirmationUrl?: string | null;
  wasPaid?: boolean;
}): WhatsappTemplateCopy {
  const ext = args.wasPaid
    ? `#${shortOrderId(args.orderNumber)} cancelado. Contactaremos si hubo pago.`
    : args.confirmationUrl
      ? `#${shortOrderId(args.orderNumber)} cancelado. ${args.confirmationUrl}`
      : `#${shortOrderId(args.orderNumber)} · ${moneyUsd(args.subtotalCents, args.currency)} cancelado.`;
  return {
    contact: truncateTemplateParam(
      args.customerName.trim().split(/\s+/)[0] || args.customerName || 'Cliente',
      40,
    ),
    contentMessage: truncateTemplateParam(
      `Pedido cancelado #${shortOrderId(args.orderNumber)}.`,
      WHATSAPP_CONTENT_MESSAGE_MAX_LENGTH,
    ),
    contentMessageExt: truncateTemplateParam(
      ext,
      WHATSAPP_CONTENT_MESSAGE_EXT_MAX_LENGTH,
    ),
  };
}

export function buildMarketplacePaymentApprovedCustomerCopy(args: {
  customerName: string;
  orderNumber: string;
  subtotalCents: number;
  amountCents?: number;
  currency?: string;
  paymentMethodLabel?: string;
  transactionReference?: string;
}): WhatsappTemplateCopy {
  const amount = args.amountCents ?? args.subtotalCents;
  const method = args.paymentMethodLabel?.trim();
  const tx = args.transactionReference?.trim();
  const contentMessage = method
    ? truncateTemplateParam(
        `Pago confirmado (${method}).`,
        WHATSAPP_CONTENT_MESSAGE_MAX_LENGTH,
      )
    : truncateTemplateParam(
        'Pago confirmado. Gracias.',
        WHATSAPP_CONTENT_MESSAGE_MAX_LENGTH,
      );
  const extParts = [
    `#${shortOrderId(args.orderNumber)}`,
    moneyUsd(amount, args.currency),
    method,
    tx ? `Tx ${tx}` : '',
    'Prepararemos su pedido.',
  ].filter(Boolean);
  return {
    contact: truncateTemplateParam(
      args.customerName.trim().split(/\s+/)[0] || args.customerName || 'Cliente',
      40,
    ),
    contentMessage,
    contentMessageExt: truncateTemplateParam(
      extParts.join(' · '),
      WHATSAPP_CONTENT_MESSAGE_EXT_MAX_LENGTH,
    ),
  };
}

export function buildCustomCopy(args: {
  contact: string;
  contentMessage: string;
  contentMessageExt?: string;
}): WhatsappTemplateCopy {
  return {
    contact: truncateTemplateParam(args.contact || 'Hola', 40),
    contentMessage: truncateTemplateParam(
      args.contentMessage,
      WHATSAPP_CONTENT_MESSAGE_MAX_LENGTH,
    ),
    contentMessageExt: truncateTemplateParam(
      args.contentMessageExt ?? '',
      WHATSAPP_CONTENT_MESSAGE_EXT_MAX_LENGTH,
    ),
  };
}
