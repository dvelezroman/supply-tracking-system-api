import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { MockPayPalClient } from './mock-paypal.client';
import { PaypalService } from './paypal.service';
import { PaypalWebhookController } from './paypal-webhook.controller';
import { PaypalWebhookService } from './paypal-webhook.service';
import { RealPayPalClient } from './real-paypal.client';

@Module({
  imports: [PrismaModule],
  controllers: [PaypalWebhookController],
  providers: [
    MockPayPalClient,
    RealPayPalClient,
    PaypalService,
    PaypalWebhookService,
  ],
  exports: [PaypalService, PaypalWebhookService],
})
export class PaypalModule {}
