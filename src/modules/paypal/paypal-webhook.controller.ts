import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { SkipEnvelope } from '../../common/decorators/skip-envelope.decorator';
import { PaypalWebhookService } from './paypal-webhook.service';

@ApiTags('marketplace')
@Controller('marketplace/paypal')
export class PaypalWebhookController {
  constructor(private readonly webhooks: PaypalWebhookService) {}

  @Post('webhook')
  @SkipEnvelope()
  @HttpCode(200)
  @ApiOperation({ summary: 'PayPal webhook (signature verified in live mode)' })
  async handle(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const raw =
      req.rawBody ??
      Buffer.from(
        typeof body === 'string' ? body : JSON.stringify(body ?? {}),
      );
    const result = await this.webhooks.processRawWebhook(raw, headers);
    if (!result.ok) {
      res.status(400);
      return { ok: false, reason: result.reason };
    }
    return { ok: true };
  }
}
