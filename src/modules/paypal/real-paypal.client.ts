import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CapturePayPalResult,
  CreatePayPalCheckoutInput,
  CreatePayPalCheckoutResult,
  PayPalClient,
  centsToPayPalAmount,
  payPalAmountToCents,
} from './paypal.types';

interface PayPalTokenCache {
  accessToken: string;
  expiresAt: number;
}

@Injectable()
export class RealPayPalClient implements PayPalClient {
  readonly mode = 'live' as const;
  private readonly logger = new Logger(RealPayPalClient.name);
  private tokenCache: PayPalTokenCache | null = null;

  constructor(private readonly config: ConfigService) {}

  private get baseUrl(): string {
    const mode = this.config.get<string>('paypal.mode') || 'sandbox';
    return mode === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';
  }

  private get clientId(): string {
    return this.config.get<string>('paypal.clientId') || '';
  }

  private get clientSecret(): string {
    return this.config.get<string>('paypal.clientSecret') || '';
  }

  async createCheckoutOrder(
    input: CreatePayPalCheckoutInput,
  ): Promise<CreatePayPalCheckoutResult> {
    const accessToken = await this.getAccessToken();
    const amount = centsToPayPalAmount(input.amountCents);
    const currency = input.currency.toUpperCase();

    const res = await fetch(`${this.baseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            invoice_id: input.orderNumber.slice(0, 127),
            custom_id: input.orderNumber.slice(0, 127),
            amount: {
              currency_code: currency,
              value: amount,
            },
          },
        ],
        application_context: {
          brand_name: 'MAREA ALTA',
          landing_page: 'NO_PREFERENCE',
          user_action: 'PAY_NOW',
          return_url: input.returnUrl,
          cancel_url: input.cancelUrl,
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`PayPal create order failed: ${res.status} ${text}`);
      throw new Error(`PayPal create order failed: ${res.status}`);
    }

    const body = (await res.json()) as {
      id: string;
      links?: Array<{ rel: string; href: string }>;
    };
    const approveUrl = body.links?.find((l) => l.rel === 'approve')?.href;
    if (!body.id || !approveUrl) {
      throw new Error('PayPal create order missing id or approve link');
    }
    return { paypalOrderId: body.id, approveUrl };
  }

  async captureOrder(paypalOrderId: string): Promise<CapturePayPalResult> {
    const accessToken = await this.getAccessToken();
    const res = await fetch(
      `${this.baseUrl}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
      },
    );

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`PayPal capture failed: ${res.status} ${text}`);
      return {
        status: 'FAILED',
        captureId: '',
        amountCents: 0,
        currency: 'USD',
      };
    }

    const body = (await res.json()) as {
      status?: string;
      purchase_units?: Array<{
        payments?: {
          captures?: Array<{
            id: string;
            status: string;
            amount?: { value: string; currency_code: string };
          }>;
        };
      }>;
    };

    const capture = body.purchase_units?.[0]?.payments?.captures?.[0];
    if (!capture || capture.status !== 'COMPLETED') {
      return {
        status: body.status === 'COMPLETED' ? 'COMPLETED' : 'FAILED',
        captureId: capture?.id ?? '',
        amountCents: capture?.amount
          ? payPalAmountToCents(capture.amount.value)
          : 0,
        currency: capture?.amount?.currency_code ?? 'USD',
      };
    }

    return {
      status: 'COMPLETED',
      captureId: capture.id,
      amountCents: payPalAmountToCents(capture.amount?.value ?? '0'),
      currency: (capture.amount?.currency_code ?? 'USD').toUpperCase(),
    };
  }

  async getOrder(paypalOrderId: string) {
    const accessToken = await this.getAccessToken();
    const res = await fetch(
      `${this.baseUrl}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { status?: string };
    return { status: body.status ?? 'UNKNOWN' };
  }

  async verifyWebhookSignature(args: {
    transmissionId: string;
    transmissionTime: string;
    certUrl: string;
    authAlgo: string;
    transmissionSig: string;
    webhookEvent: unknown;
  }): Promise<boolean> {
    const webhookId = this.config.get<string>('paypal.webhookId') || '';
    if (!webhookId) {
      this.logger.warn('PAYPAL_WEBHOOK_ID not set; rejecting webhook');
      return false;
    }
    const accessToken = await this.getAccessToken();
    const res = await fetch(
      `${this.baseUrl}/v1/notifications/verify-webhook-signature`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transmission_id: args.transmissionId,
          transmission_time: args.transmissionTime,
          cert_url: args.certUrl,
          auth_algo: args.authAlgo,
          transmission_sig: args.transmissionSig,
          webhook_id: webhookId,
          webhook_event: args.webhookEvent,
        }),
      },
    );
    if (!res.ok) {
      this.logger.error(`Webhook verify HTTP ${res.status}`);
      return false;
    }
    const body = (await res.json()) as { verification_status?: string };
    return body.verification_status === 'SUCCESS';
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.tokenCache && this.tokenCache.expiresAt > now + 30_000) {
      return this.tokenCache.accessToken;
    }
    const auth = Buffer.from(
      `${this.clientId}:${this.clientSecret}`,
    ).toString('base64');
    const res = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`PayPal OAuth failed: ${res.status} ${text}`);
    }
    const body = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };
    this.tokenCache = {
      accessToken: body.access_token,
      expiresAt: now + (body.expires_in ?? 3600) * 1000,
    };
    return body.access_token;
  }
}
