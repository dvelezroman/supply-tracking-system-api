import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { UserRole, WhatsappNotificationSource } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { WhatsappNotificationLogsService } from './whatsapp-notification-logs.service';
import { WhatsappNotificationsService } from './whatsapp-notifications.service';
import { WhatsappOccasion } from './whatsapp-occasion.enum';
import { WhatsappService } from './whatsapp.service';

class ListWhatsappLogsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  occasion?: string;

  @IsOptional()
  @IsEnum(WhatsappNotificationSource)
  source?: WhatsappNotificationSource;

  @IsOptional()
  @IsUUID()
  marketplaceOrderId?: string;
}

class ResendWhatsappDto {
  @IsUUID()
  orderId!: string;

  @IsEnum(WhatsappOccasion)
  occasion!: WhatsappOccasion;

  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

@ApiTags('whatsapp')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('whatsapp')
export class WhatsappController {
  constructor(
    private readonly notifications: WhatsappNotificationsService,
    private readonly logs: WhatsappNotificationLogsService,
    private readonly whatsapp: WhatsappService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Notificador configuration status (no secrets)' })
  status() {
    return {
      enabled: this.whatsapp.isEnabled(),
      configured: this.whatsapp.isConfigured(),
      hasCredentials: this.whatsapp.hasBaseCredentials(),
      hasDefaultTemplate: Boolean(this.whatsapp.defaultTemplateId()),
    };
  }

  @Get('logs')
  @ApiOperation({ summary: 'List WhatsApp notification logs' })
  listLogs(@Query() query: ListWhatsappLogsQueryDto) {
    return this.logs.listLogs({
      page: query.page ?? 1,
      limit: query.limit ?? 25,
      occasion: query.occasion,
      source: query.source,
      marketplaceOrderId: query.marketplaceOrderId,
    });
  }

  @Post('resend')
  @ApiOperation({
    summary:
      'Resend a WhatsApp notification for an order (staff, force by default)',
  })
  async resend(
    @Body() body: ResendWhatsappDto,
    @CurrentUser() user: { id: string },
  ) {
    if (!user?.id) {
      throw new BadRequestException('Authenticated user required');
    }
    return this.notifications.resendForOrder({
      orderId: body.orderId,
      occasion: body.occasion,
      actorUserId: user.id,
      force: body.force !== false,
    });
  }
}
