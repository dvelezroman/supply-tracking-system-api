import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PublicTraceService } from './public-trace.service';
import { SkipEnvelope } from '../../common/decorators/skip-envelope.decorator';

@ApiTags('public')
@SkipEnvelope()
@Controller('public/trace')
export class PublicTraceController {
  constructor(private readonly publicTraceService: PublicTraceService) {}

  @Get(':lotCode')
  @ApiOperation({
    summary: 'Public traceability lookup — no auth required',
    description: 'Returns full lot info and event history. Intended for end-consumers scanning a QR code on the product packaging.',
  })
  @ApiParam({ name: 'lotCode', example: 'P2-0226-PD-IQF-A' })
  @ApiResponse({ status: 200, description: 'Full traceability data for the lot' })
  @ApiResponse({ status: 404, description: 'Lot not found' })
  getTrace(@Param('lotCode') lotCode: string) {
    return this.publicTraceService.getPublicTrace(lotCode);
  }
}
