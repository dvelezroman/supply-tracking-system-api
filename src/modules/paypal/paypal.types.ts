export type PayPalProviderMode = 'mock' | 'live' | 'off';

export interface CreatePayPalCheckoutInput {
  orderNumber: string;
  amountCents: number;
  currency: string;
  returnUrl: string;
  cancelUrl: string;
}

export interface CreatePayPalCheckoutResult {
  paypalOrderId: string;
  approveUrl: string;
}

export interface CapturePayPalResult {
  status: 'COMPLETED' | 'FAILED' | 'PENDING';
  captureId: string;
  amountCents: number;
  currency: string;
}

export interface PayPalClient {
  readonly mode: 'mock' | 'live';
  createCheckoutOrder(
    input: CreatePayPalCheckoutInput,
  ): Promise<CreatePayPalCheckoutResult>;
  captureOrder(paypalOrderId: string): Promise<CapturePayPalResult>;
  getOrder?(paypalOrderId: string): Promise<{ status: string } | null>;
}

export function centsToPayPalAmount(cents: number): string {
  return (Math.max(0, cents) / 100).toFixed(2);
}

export function payPalAmountToCents(value: string): number {
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}
