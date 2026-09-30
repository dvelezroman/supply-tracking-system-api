import { Injectable } from '@nestjs/common';
import { WhatsappNotificationSource } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { getWhatsappOccasionLabel } from './whatsapp-occasion.enum';

export type RecordWhatsappNotificationSendInput = {
  occasionKey: string;
  recipientKey: string;
  recipientLabel: string;
  occasion: string;
  source?: WhatsappNotificationSource;
  actorUserId?: string | null;
  marketplaceOrderId?: string | null;
};

@Injectable()
export class WhatsappNotificationLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async hasDedup(occasionKey: string, recipientKey: string): Promise<boolean> {
    const existing = await this.prisma.whatsappNotificationDedup.findUnique({
      where: {
        occasionKey_recipientKey: { occasionKey, recipientKey },
      },
      select: { id: true },
    });
    return existing != null;
  }

  async recordSend(input: RecordWhatsappNotificationSendInput): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.whatsappNotificationDedup.upsert({
        where: {
          occasionKey_recipientKey: {
            occasionKey: input.occasionKey,
            recipientKey: input.recipientKey,
          },
        },
        create: {
          occasionKey: input.occasionKey,
          recipientKey: input.recipientKey,
        },
        update: {
          sentAt: new Date(),
        },
      });
      await tx.whatsappNotificationLog.create({
        data: {
          occasionKey: input.occasionKey,
          recipientKey: input.recipientKey,
          recipientLabel: input.recipientLabel.slice(0, 120),
          occasion: input.occasion.slice(0, 40),
          source: input.source ?? WhatsappNotificationSource.AUTO,
          actorUserId: input.actorUserId ?? null,
          marketplaceOrderId: input.marketplaceOrderId ?? null,
        },
      });
    });
  }

  async listLogs(params: {
    page: number;
    limit: number;
    occasion?: string;
    source?: WhatsappNotificationSource;
    marketplaceOrderId?: string;
  }) {
    const page = Math.max(1, params.page);
    const limit = Math.min(100, Math.max(1, params.limit));
    const where = {
      ...(params.occasion ? { occasion: params.occasion } : {}),
      ...(params.source ? { source: params.source } : {}),
      ...(params.marketplaceOrderId
        ? { marketplaceOrderId: params.marketplaceOrderId }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.whatsappNotificationLog.count({ where }),
      this.prisma.whatsappNotificationLog.findMany({
        where,
        orderBy: { sentAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          actor: { select: { id: true, email: true, name: true } },
          marketplaceOrder: {
            select: {
              id: true,
              orderNumber: true,
              customerName: true,
              status: true,
            },
          },
        },
      }),
    ]);

    return {
      page,
      limit,
      total,
      items: rows.map((row) => ({
        id: row.id,
        sentAt: row.sentAt.toISOString(),
        occasion: row.occasion,
        occasionLabel: getWhatsappOccasionLabel(row.occasion),
        occasionKey: row.occasionKey,
        recipientKey: row.recipientKey,
        recipientLabel: row.recipientLabel,
        source: row.source,
        actor: row.actor
          ? { id: row.actor.id, email: row.actor.email, name: row.actor.name }
          : null,
        marketplaceOrder: row.marketplaceOrder
          ? {
              id: row.marketplaceOrder.id,
              orderNumber: row.marketplaceOrder.orderNumber,
              customerName: row.marketplaceOrder.customerName,
              status: row.marketplaceOrder.status,
            }
          : null,
      })),
    };
  }
}
