import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MockPayPalClient } from './mock-paypal.client';
import { RealPayPalClient } from './real-paypal.client';
import {
  CapturePayPalResult,
  CreatePayPalCheckoutInput,
  CreatePayPalCheckoutResult,
  PayPalClient,
  PayPalProviderMode,
} from './paypal.types';

@Injectable()
export class PaypalService implements OnModuleInit {
  private readonly logger = new Logger(PaypalService.name);
  private client: PayPalClient;

  constructor(
    private readonly config: ConfigService,
    private readonly mockClient: MockPayPalClient,
    private readonly realClient: RealPayPalClient,
  ) {
    this.client = this.resolveClient();
  }

  onModuleInit(): void {
    this.logger.log(`PayPal provider: ${this.getProviderMode()}`);
  }

  isConfigured(): boolean {
    const forceMock = this.config.get<boolean>('paypal.forceMock') === true;
    if (forceMock) return false;
    const id = this.config.get<string>('paypal.clientId') || '';
    const secret = this.config.get<string>('paypal.clientSecret') || '';
    return Boolean(id && secret);
  }

  /** Mock allowed in non-production, or when PAYPAL_FORCE_MOCK=true (incl. production). */
  canUseMock(): boolean {
    const forceMock = this.config.get<boolean>('paypal.forceMock') === true;
    if (forceMock) return true;
    const nodeEnv = this.config.get<string>('nodeEnv') || 'development';
    if (nodeEnv === 'production') return false;
    return true;
  }

  getProviderMode(): PayPalProviderMode {
    if (this.isConfigured()) return 'live';
    if (this.canUseMock()) return 'mock';
    return 'off';
  }

  /** Checkout available when admin enabled payments AND we have mock or live. */
  isCheckoutAvailable(onlinePaymentsEnabled: boolean): boolean {
    if (!onlinePaymentsEnabled) return false;
    return this.getProviderMode() !== 'off';
  }

  getActiveClient(): PayPalClient {
    return this.client;
  }

  createCheckoutOrder(
    input: CreatePayPalCheckoutInput,
  ): Promise<CreatePayPalCheckoutResult> {
    return this.client.createCheckoutOrder(input);
  }

  captureOrder(paypalOrderId: string): Promise<CapturePayPalResult> {
    return this.client.captureOrder(paypalOrderId);
  }

  verifyMockSignature(
    paypalOrderId: string,
    orderNumber: string,
    sig: string,
  ): boolean {
    if (this.client.mode !== 'mock') return true;
    return this.mockClient.verifyMockSignature(
      paypalOrderId,
      orderNumber,
      sig,
    );
  }

  getRealClient(): RealPayPalClient {
    return this.realClient;
  }

  private resolveClient(): PayPalClient {
    if (this.isConfigured()) {
      return this.realClient;
    }
    if (this.canUseMock()) {
      return this.mockClient;
    }
    // Production without credentials — still bind mock but availability gates it off.
    return this.mockClient;
  }
}
