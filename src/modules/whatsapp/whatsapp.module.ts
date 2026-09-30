import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappNotificationLogsService } from './whatsapp-notification-logs.service';
import { WhatsappNotificationsService } from './whatsapp-notifications.service';
import { WhatsappService } from './whatsapp.service';

@Module({
  controllers: [WhatsappController],
  providers: [
    WhatsappService,
    WhatsappNotificationLogsService,
    WhatsappNotificationsService,
  ],
  exports: [
    WhatsappService,
    WhatsappNotificationLogsService,
    WhatsappNotificationsService,
  ],
})
export class WhatsappModule {}
