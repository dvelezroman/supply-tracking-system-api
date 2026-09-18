import { createHmac, randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CapturePayPalResult,
  CreatePayPalCheckoutInput,
  CreatePayPalCheckoutResult,
  PayPalClient,
  centsToPayPalAmount,
} from './paypal.types';

@Injectable()
export class MockPayPalClient implements PayPalClient {
  readonly mode = 'mock' as const;
  private readonly logger = new Logger(MockPayPalClient.name);
  /** In-memory amounts for mock capture verification. */
  private readonly pending = new Map<
    string,
    { amountCents: number; currency: string; orderNumber: string }
  >();

  constructor(private readonly config: ConfigService) {}

  async createCheckoutOrder(
    input: CreatePayPalCheckoutInput,
  ): Promise<CreatePayPalCheckoutResult> {
    const paypalOrderId = `MOCK-${randomUUID()}`;
    this.pending.set(paypalOrderId, {
      amountCents: input.amountCents,
      currency: input.currency.toUpperCase(),
      orderNumber: input.orderNumber,
    });

    const frontendBase = (
      this.config.get<string>('frontendUrl') ?? 'http://localhost:4200'
    ).replace(/\/$/, '');
    const sig = this.signMockToken(paypalOrderId, input.orderNumber);
    const approveUrl =
      `${frontendBase}/tienda/paypal/mock` +
      `?orderNumber=${encodeURIComponent(input.orderNumber)}` +
      `&token=${encodeURIComponent(paypalOrderId)}` +
      `&sig=${encodeURIComponent(sig)}` +
      `&amount=${input.amountCents}` +
      `&currency=${encodeURIComponent(input.currency.toUpperCase())}`;

    this.logger.log(
      `Mock PayPal order ${paypalOrderId} for ${input.orderNumber}`,
    );
    return { paypalOrderId, approveUrl };
  }

  async captureOrder(paypalOrderId: string): Promise<CapturePayPalResult> {
    if (!paypalOrderId.startsWith('MOCK-')) {
      return {
        status: 'FAILED',
        captureId: '',
        amountCents: 0,
        currency: 'USD',
      };
    }
    const pending = this.pending.get(paypalOrderId);
    const amountCents = pending?.amountCents ?? 0;
    const currency = pending?.currency ?? 'USD';
    this.pending.delete(paypalOrderId);
    return {
      status: 'COMPLETED',
      captureId: `MOCK-CAP-${randomUUID()}`,
      amountCents,
      currency,
    };
  }

  async getOrder(paypalOrderId: string) {
    if (!paypalOrderId.startsWith('MOCK-')) return null;
    return { status: this.pending.has(paypalOrderId) ? 'CREATED' : 'COMPLETED' };
  }

  verifyMockSignature(
    paypalOrderId: string,
    orderNumber: string,
    sig: string,
  ): boolean {
    return this.signMockToken(paypalOrderId, orderNumber) === sig;
  }

  private signMockToken(paypalOrderId: string, orderNumber: string): string {
    const secret =
      this.config.get<string>('jwt.secret') ||
      'default-secret-change-in-production';
    return createHmac('sha256', secret)
      .update(`${paypalOrderId}:${orderNumber}`)
      .digest('hex')
      .slice(0, 32);
  }

  /** Expose amount helper for logging / tests. */
  formatAmount(cents: number): string {
    return centsToPayPalAmount(cents);
  }
}
