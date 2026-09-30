import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_TAX_RATE_BPS,
  fromSubtotalExclusiveTax,
  truncateClientTxId,
  truncateReference,
} from './payphone-amounts.util';
import type {
  PayphoneBoxConfig,
  PayphoneConfirmResponse,
} from './payphone.types';

@Injectable()
export class PayphoneService {
  private readonly logger = new Logger(PayphoneService.name);

  constructor(private readonly config: ConfigService) {}

  getToken(): string {
    return this.config.get<string>('payphone.token')?.trim() || '';
  }

  getStoreId(): string {
    return this.config.get<string>('payphone.storeId')?.trim() || '';
  }

  getConfirmUrl(): string {
    return (
      this.config.get<string>('payphone.confirmUrl')?.trim() ||
      'https://paymentbox.payphonetodoesposible.com/api/confirm'
    );
  }

  getTaxRateBps(): number {
    const raw = this.config.get<number>('payphone.taxRateBps');
    if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
      return Math.floor(raw);
    }
    return DEFAULT_TAX_RATE_BPS;
  }

  /** True when admin flag is on and credentials exist. */
  isCheckoutAvailable(cardPaymentsEnabled: boolean): boolean {
    if (!cardPaymentsEnabled) return false;
    const envEnabled = this.config.get<boolean>('payphone.paymentsEnabled');
    if (envEnabled === false) return false;
    return Boolean(this.getToken() && this.getStoreId());
  }

  buildAmounts(subtotalCents: number) {
    return fromSubtotalExclusiveTax(subtotalCents, this.getTaxRateBps());
  }

  buildBoxConfig(args: {
    clientTransactionId: string;
    subtotalCents: number;
    currency: string;
    orderNumber: string;
    email?: string;
    phoneNumber?: string;
  }): PayphoneBoxConfig {
    const amounts = this.buildAmounts(args.subtotalCents);
    const token = this.getToken();
    const storeId = this.getStoreId();
    if (!token || !storeId) {
      throw new ServiceUnavailableException('Payphone is not configured');
    }
    return {
      token,
      storeId,
      clientTransactionId: truncateClientTxId(args.clientTransactionId),
      amount: amounts.amount,
      amountWithTax: amounts.amountWithTax,
      amountWithoutTax: amounts.amountWithoutTax,
      tax: amounts.tax,
      service: amounts.service,
      tip: amounts.tip,
      currency: (args.currency || 'USD').toUpperCase(),
      reference: truncateReference(`Pedido ${args.orderNumber}`),
      lang: 'es',
      defaultMethod: 'card',
      timeZone: -5,
      lat: this.config.get<string>('payphone.lat') || undefined,
      lng: this.config.get<string>('payphone.lng') || undefined,
      email: args.email,
      phoneNumber: args.phoneNumber,
      optionalParameter: truncateClientTxId(args.orderNumber, 50),
    };
  }

  async confirmTransaction(
    id: number,
    clientTxId: string,
  ): Promise<PayphoneConfirmResponse> {
    const token = this.getToken();
    if (!token) {
      throw new ServiceUnavailableException('Payphone token is not configured');
    }
    const url = this.getConfirmUrl();
    const body = { id: Number(id), clientTxId: String(clientTxId) };

    const controller = new AbortController();
    const timeoutMs =
      this.config.get<number>('payphone.confirmTimeoutMs') ?? 15000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const text = await res.text();
      let json: PayphoneConfirmResponse = {};
      try {
        json = text ? (JSON.parse(text) as PayphoneConfirmResponse) : {};
      } catch {
        this.logger.error(
          `Payphone confirm non-JSON response (${res.status}): ${text.slice(0, 200)}`,
        );
        throw new ServiceUnavailableException(
          'Payphone confirm returned invalid response',
        );
      }

      if (!res.ok) {
        this.logger.warn(
          `Payphone confirm HTTP ${res.status}: ${json.message ?? text.slice(0, 200)}`,
        );
        return {
          ...json,
          transactionStatus: json.transactionStatus ?? 'Canceled',
          statusCode: json.statusCode ?? 2,
          message: json.message ?? `HTTP ${res.status}`,
        };
      }

      return json;
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Payphone confirm failed: ${msg}`);
      throw new ServiceUnavailableException(
        `Unable to confirm Payphone payment: ${msg}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  isApproved(result: PayphoneConfirmResponse): boolean {
    const status = (result.transactionStatus || '').toLowerCase();
    if (status === 'approved') return true;
    return result.statusCode === 3;
  }
}
