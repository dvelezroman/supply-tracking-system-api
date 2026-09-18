import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaypalService } from './paypal.service';

export type PaypalWebhookHandler = (payload: {
  eventType: string;
  paypalOrderId?: string;
  captureId?: string;
}) => Promise<void>;

@Injectable()
export class PaypalWebhookService {
  private readonly logger = new Logger(PaypalWebhookService.name);
  private handler: PaypalWebhookHandler | null = null;

  constructor(
    private readonly paypal: PaypalService,
    private readonly prisma: PrismaService,
  ) {}

  /** Marketplace registers capture completion handler. */
  setHandler(handler: PaypalWebhookHandler): void {
    this.handler = handler;
  }

  async processRawWebhook(
    rawBody: Buffer | string,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<{ ok: boolean; reason?: string }> {
    if (this.paypal.getProviderMode() !== 'live') {
      return { ok: true, reason: 'webhook ignored in mock mode' };
    }

    let event: {
      id?: string;
      event_type?: string;
      resource?: {
        id?: string;
        supplementary_data?: {
          related_ids?: { order_id?: string };
        };
        purchase_units?: Array<{
          payments?: {
            captures?: Array<{ id: string }>;
          };
        }>;
      };
    };

    try {
      const text =
        typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
      event = JSON.parse(text) as typeof event;
    } catch {
      return { ok: false, reason: 'invalid json' };
    }

    const transmissionId = header(headers, 'paypal-transmission-id');
    const transmissionTime = header(headers, 'paypal-transmission-time');
    const certUrl = header(headers, 'paypal-cert-url');
    const authAlgo = header(headers, 'paypal-auth-algo');
    const transmissionSig = header(headers, 'paypal-transmission-sig');

    if (
      !transmissionId ||
      !transmissionTime ||
      !certUrl ||
      !authAlgo ||
      !transmissionSig
    ) {
      return { ok: false, reason: 'missing signature headers' };
    }

    const valid = await this.paypal.getRealClient().verifyWebhookSignature({
      transmissionId,
      transmissionTime,
      certUrl,
      authAlgo,
      transmissionSig,
      webhookEvent: event,
    });
    if (!valid) {
      return { ok: false, reason: 'signature verification failed' };
    }

    const eventId = event.id;
    if (!eventId) {
      return { ok: false, reason: 'missing event id' };
    }

    const existing = await this.prisma.paypalWebhookEvent.findUnique({
      where: { id: eventId },
    });
    if (existing) {
      return { ok: true, reason: 'already processed' };
    }

    await this.prisma.paypalWebhookEvent.create({
      data: {
        id: eventId,
        eventType: event.event_type ?? 'UNKNOWN',
      },
    });

    const eventType = event.event_type ?? '';
    const paypalOrderId =
      event.resource?.supplementary_data?.related_ids?.order_id ||
      (eventType.startsWith('CHECKOUT.ORDER') ? event.resource?.id : undefined);
    const captureId =
      event.resource?.purchase_units?.[0]?.payments?.captures?.[0]?.id ||
      (eventType.includes('CAPTURE') ? event.resource?.id : undefined);

    this.logger.log(
      `PayPal webhook ${eventType} order=${paypalOrderId ?? '-'} capture=${captureId ?? '-'}`,
    );

    if (this.handler) {
      await this.handler({ eventType, paypalOrderId, captureId });
    }

    return { ok: true };
  }
}

function header(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string {
  const key = Object.keys(headers).find(
    (k) => k.toLowerCase() === name.toLowerCase(),
  );
  if (!key) return '';
  const v = headers[key];
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}
