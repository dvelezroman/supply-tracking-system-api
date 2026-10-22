import type { MarketplacePaymentMethod } from '@prisma/client';

export type ResolvedMarketplacePaymentDetails = {
  paymentMethodLabel: string;
  /** Short ref for WhatsApp / UI (capture id, Payphone tx id, etc.). */
  transactionReference?: string;
  authorizationCode?: string;
  payphoneTransactionId?: string;
  payphoneClientTxId?: string;
  payphoneId?: number;
  paypalCaptureId?: string;
  paypalOrderId?: string;
};

export function marketplacePaymentMethodLabel(
  method?: MarketplacePaymentMethod | string | null,
): string {
  switch (method) {
    case 'BANK_TRANSFER':
      return 'Transferencia bancaria';
    case 'PAYPAL':
      return 'PayPal';
    case 'CARD':
      return 'Tarjeta (Payphone)';
    case 'EMAIL':
      return 'Coordinación por correo';
    default:
      return method?.trim() || 'Pago';
  }
}

type OrderPaymentSource = {
  paymentMethod?: MarketplacePaymentMethod | string | null;
  paypalCaptureId?: string | null;
  paypalOrderId?: string | null;
  payphoneClientTxId?: string | null;
};

type PaymentRowSource = {
  transactionId?: string | null;
  authorizationCode?: string | null;
  payphoneId?: number | null;
  clientTransactionId?: string;
} | null;

export function resolveMarketplacePaymentDetails(
  order: OrderPaymentSource,
  paymentRow?: PaymentRowSource,
  overrides?: {
    authorizationCode?: string | null;
    payphoneTransactionId?: string | null;
  },
): ResolvedMarketplacePaymentDetails {
  const method = order.paymentMethod ?? undefined;
  const paymentMethodLabel = marketplacePaymentMethodLabel(method);

  const payphoneTransactionId =
    overrides?.payphoneTransactionId?.trim() ||
    paymentRow?.transactionId?.trim() ||
    undefined;
  const authorizationCode =
    overrides?.authorizationCode?.trim() ||
    paymentRow?.authorizationCode?.trim() ||
    undefined;
  const payphoneClientTxId =
    order.payphoneClientTxId?.trim() ||
    paymentRow?.clientTransactionId?.trim() ||
    undefined;
  const payphoneId =
    paymentRow?.payphoneId != null && paymentRow.payphoneId > 0
      ? paymentRow.payphoneId
      : undefined;

  const paypalCaptureId = order.paypalCaptureId?.trim() || undefined;
  const paypalOrderId = order.paypalOrderId?.trim() || undefined;

  let transactionReference: string | undefined;
  if (method === 'PAYPAL') {
    transactionReference = paypalCaptureId || paypalOrderId;
  } else if (method === 'CARD') {
    transactionReference =
      payphoneTransactionId ||
      (payphoneId != null ? String(payphoneId) : undefined) ||
      payphoneClientTxId;
  }

  return {
    paymentMethodLabel,
    transactionReference,
    authorizationCode,
    payphoneTransactionId,
    payphoneClientTxId,
    payphoneId,
    paypalCaptureId,
    paypalOrderId,
  };
}
