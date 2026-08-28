import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { StorageModule } from '../storage/storage.module';
import {
  MarketplaceOrdersAdminController,
  MarketplaceOrdersPublicController,
} from './marketplace-orders.controller';
import {
  MarketplaceAdminController,
  MarketplacePublicController,
} from './marketplace.controller';
import { MarketplaceRepository } from './marketplace.repository';
import { MarketplaceService } from './marketplace.service';

@Module({
  imports: [StorageModule, MailModule],
  controllers: [
    MarketplacePublicController,
    MarketplaceAdminController,
    MarketplaceOrdersPublicController,
    MarketplaceOrdersAdminController,
  ],
  providers: [MarketplaceService, MarketplaceRepository],
  exports: [MarketplaceService],
})
export class MarketplaceModule {}
