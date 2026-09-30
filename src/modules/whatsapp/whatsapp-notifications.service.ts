import { Injectable, Logger } from '@nestjs/common';
import {
  MarketplacePaymentMethod,
  UserRole,
  WhatsappNotificationSource,
} from '@prisma/client';
import { normalizePhoneE164 } from '../../common/phone.util';
import { maskPhone } from '../../common/pii.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { BankTransferEmailDetails } from '../mail/order-email.util';
import {
  buildCustomCopy,
  buildMarketplaceOrderReceivedCustomerCopy,
  buildMarketplacePaymentApprovedCustomerCopy,
  buildMarketplacePendingAdminCopy,
  type WhatsappTemplateCopy,
} from './whatsapp-messages.util';
import { WhatsappNotificationLogsService } from './whatsapp-notification-logs.service';
import { WhatsappOccasion } from './whatsapp-occasion.enum';
import { WhatsappService } from './whatsapp.service';

export type WhatsappSendStatus =
  | 'sent'
  | 'skipped_no_phone'
  | 'skipped_notify_disabled'
  | 'skipped_duplicate'
  | 'skipped_not_configured'
  | 'failed';

export type NotifyDispatchInput = {
  occasion: WhatsappOccasion;
  occasionKey: string;
  recipientKey: string;
  recipientLabel: string;
  phone: string | null | undefined;
  copy: WhatsappTemplateCopy;
  source?: WhatsappNotificationSource;
  force?: boolean;
  actorUserId?: string | null;
  marketplaceOrderId?: string | null;
  usePaymentApprovedTemplate?: boolean;
};

export type BatchSendSummary = {
  sent: number;
  skipped: number;
  failed: number;
  results: Array<{
    userId?: string;
    status: WhatsappSendStatus;
  }>;
};

export type MarketplaceOrderNotifyInput = {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string | null;
  subtotalCents: number;
  currency: string;
  paymentMethod: MarketplacePaymentMethod | string;
  notifyWhatsapp?: boolean;
};

@Injectable()
export class WhatsappNotificationsService {
  private readonly logger = new Logger(WhatsappNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
    private readonly logs: WhatsappNotificationLogsService,
  ) {}

  isConfigured(): boolean {
    return this.whatsapp.isEnabled() && this.whatsapp.isConfigured();
  }

  async dispatch(input: NotifyDispatchInput): Promise<WhatsappSendStatus> {
    if (!this.isConfigured()) {
      return 'skipped_not_configured';
    }

    const e164 = normalizePhoneE164(input.phone);
    if (!e164) {
      return 'skipped_no_phone';
    }

    if (!input.force) {
      const dup = await this.logs.hasDedup(
        input.occasionKey,
        input.recipientKey,
      );
      if (dup) {
        return 'skipped_duplicate';
      }
    }

    try {
      const sendArgs = {
        phoneDigits: e164,
        contact: input.copy.contact,
        contentMessage: input.copy.contentMessage,
        contentMessageExt: input.copy.contentMessageExt,
      };
      const result = input.usePaymentApprovedTemplate
        ? await this.whatsapp.sendPaymentApprovedTemplate(sendArgs)
        : await this.whatsapp.sendDefaultTemplate(sendArgs);
      if (!result.ok) {
        this.logger.warn(
          `WhatsApp send failed occasion=${input.occasion} to=${maskPhone(e164)} status=${result.status}`,
        );
        return 'failed';
      }
      await this.logs.recordSend({
        occasionKey: input.occasionKey,
        recipientKey: input.recipientKey,
        recipientLabel: input.recipientLabel,
        occasion: input.occasion,
        source: input.source ?? WhatsappNotificationSource.AUTO,
        actorUserId: input.actorUserId,
        marketplaceOrderId: input.marketplaceOrderId,
      });
      return 'sent';
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'unknown';
      this.logger.error(
        `WhatsApp send error occasion=${input.occasion} to=${maskPhone(e164)}: ${detail}`,
      );
      return 'failed';
    }
  }

  private async listAdminsWithPhone() {
    return this.prisma.user.findMany({
      where: {
        role: UserRole.ADMIN,
        phone: { not: null },
      },
      select: { id: true, email: true, name: true, phone: true },
    });
  }

  async notifyMarketplacePendingAdmins(
    order: MarketplaceOrderNotifyInput,
  ): Promise<BatchSendSummary> {
    const admins = await this.listAdminsWithPhone();
    const results: BatchSendSummary['results'] = [];
    let sent = 0;
    let skipped = 0;
    let failed = 0;
    for (const admin of admins) {
      const status = await this.dispatch({
        occasion: WhatsappOccasion.MARKETPLACE_PENDING_ADMIN,
        occasionKey: `marketplace-pending-admin:${order.id}`,
        recipientKey: `admin:${admin.id}`,
        recipientLabel: admin.email,
        phone: admin.phone,
        actorUserId: admin.id,
        marketplaceOrderId: order.id,
        copy: buildMarketplacePendingAdminCopy({
          adminName: admin.name || admin.email.split('@')[0],
          customerName: order.customerName,
          orderNumber: order.orderNumber,
          subtotalCents: order.subtotalCents,
          currency: order.currency,
          paymentMethod: order.paymentMethod,
        }),
      });
      results.push({ userId: admin.id, status });
      if (status === 'sent') sent += 1;
      else if (status === 'failed') failed += 1;
      else skipped += 1;
    }
    return { sent, skipped, failed, results };
  }

  async notifyCustomerOrderReceived(
    order: MarketplaceOrderNotifyInput,
    opts?: {
      bankTransfer?: BankTransferEmailDetails | null;
      confirmationUrl?: string | null;
      force?: boolean;
      actorUserId?: string | null;
      source?: WhatsappNotificationSource;
    },
  ): Promise<WhatsappSendStatus> {
    if (order.notifyWhatsapp === false) {
      return 'skipped_notify_disabled';
    }
    return this.dispatch({
      occasion: WhatsappOccasion.MARKETPLACE_ORDER_RECEIVED_CUSTOMER,
      occasionKey: `marketplace-received-customer:${order.id}`,
      recipientKey: `customer:${order.id}`,
      recipientLabel: order.customerName,
      phone: order.customerPhone,
      marketplaceOrderId: order.id,
      force: opts?.force,
      actorUserId: opts?.actorUserId,
      source: opts?.source,
      copy: buildMarketplaceOrderReceivedCustomerCopy({
        customerName: order.customerName,
        orderNumber: order.orderNumber,
        paymentMethod: order.paymentMethod,
        bankTransfer: opts?.bankTransfer ?? null,
        subtotalCents: order.subtotalCents,
        currency: order.currency,
        confirmationUrl: opts?.confirmationUrl,
      }),
    });
  }

  async notifyCustomerPaymentApproved(
    order: MarketplaceOrderNotifyInput,
    opts?: {
      force?: boolean;
      actorUserId?: string | null;
      source?: WhatsappNotificationSource;
    },
  ): Promise<WhatsappSendStatus> {
    if (order.notifyWhatsapp === false) {
      return 'skipped_notify_disabled';
    }
    return this.dispatch({
      occasion: WhatsappOccasion.MARKETPLACE_PAYMENT_APPROVED_CUSTOMER,
      occasionKey: `marketplace-paid-customer:${order.id}`,
      recipientKey: `customer:${order.id}`,
      recipientLabel: order.customerName,
      phone: order.customerPhone,
      marketplaceOrderId: order.id,
      force: opts?.force,
      actorUserId: opts?.actorUserId,
      source: opts?.source,
      usePaymentApprovedTemplate: true,
      copy: buildMarketplacePaymentApprovedCustomerCopy({
        customerName: order.customerName,
        orderNumber: order.orderNumber,
        subtotalCents: order.subtotalCents,
        currency: order.currency,
      }),
    });
  }

  async resendForOrder(args: {
    orderId: string;
    occasion: WhatsappOccasion;
    actorUserId: string;
    force?: boolean;
    bankTransfer?: BankTransferEmailDetails | null;
    confirmationUrl?: string | null;
  }): Promise<WhatsappSendStatus | BatchSendSummary> {
    const order = await this.prisma.marketplaceOrder.findUnique({
      where: { id: args.orderId },
    });
    if (!order) {
      return 'skipped_no_phone';
    }
    const input: MarketplaceOrderNotifyInput = {
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      subtotalCents: order.subtotalCents,
      currency: order.currency,
      paymentMethod: order.paymentMethod,
      notifyWhatsapp: order.notifyWhatsapp,
    };
    const force = args.force !== false;
    const common = {
      force,
      actorUserId: args.actorUserId,
      source: WhatsappNotificationSource.STAFF,
    };

    if (args.occasion === WhatsappOccasion.MARKETPLACE_PENDING_ADMIN) {
      return this.notifyMarketplacePendingAdmins(input);
    }
    if (args.occasion === WhatsappOccasion.MARKETPLACE_ORDER_RECEIVED_CUSTOMER) {
      return this.notifyCustomerOrderReceived(input, {
        ...common,
        bankTransfer: args.bankTransfer,
        confirmationUrl: args.confirmationUrl,
      });
    }
    if (
      args.occasion === WhatsappOccasion.MARKETPLACE_PAYMENT_APPROVED_CUSTOMER
    ) {
      return this.notifyCustomerPaymentApproved(input, common);
    }

    return this.dispatch({
      occasion: WhatsappOccasion.CUSTOM,
      occasionKey: `custom:${order.id}:${Date.now()}`,
      recipientKey: `customer:${order.id}`,
      recipientLabel: order.customerName,
      phone: order.customerPhone,
      marketplaceOrderId: order.id,
      force,
      actorUserId: args.actorUserId,
      source: WhatsappNotificationSource.STAFF,
      copy: buildCustomCopy({
        contact: order.customerName,
        contentMessage: `Pedido #${order.orderNumber}`,
        contentMessageExt: '',
      }),
    });
  }
}
