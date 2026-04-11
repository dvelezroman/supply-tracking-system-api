import { Controller, Get, Post, Body, Query, Param, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TraceabilityService } from './traceability.service';
import { CreateEventDto } from './dto/create-event.dto';
import { ListEventsQueryDto } from './dto/list-events-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('traceability')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('traceability')
export class TraceabilityController {
  constructor(private readonly traceabilityService: TraceabilityService) {}

  @Post('events')
  @ApiOperation({ summary: 'Record a traceability event for a lot' })
  @ApiResponse({ status: 201, description: 'Event recorded (append-only)' })
  @ApiResponse({ status: 404, description: 'Lot or actor not found' })
  recordEvent(@Body() dto: CreateEventDto) {
    return this.traceabilityService.recordEvent(dto);
  }

  @Get('events')
  @ApiOperation({
    summary: 'List all events (paginated)',
    description:
      'Optional filters: product, lot, event type, event date range (when the checkpoint was recorded), and/or lot harvest date range.',
  })
  @ApiQuery({ name: 'lotId', required: false })
  @ApiQuery({ name: 'productId', required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'harvestDateFrom', required: false })
  @ApiQuery({ name: 'harvestDateTo', required: false })
  @ApiQuery({ name: 'eventType', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiResponse({ status: 200, description: 'Paginated event list with lot, product and actor details' })
  @ApiResponse({ status: 400, description: 'Invalid date range' })
  findAll(@Query() query: ListEventsQueryDto) {
    return this.traceabilityService.findAll(query);
  }

  @Get('products/:productId/history')
  @ApiOperation({
    summary: 'Traceability history for a product',
    description:
      'Returns all traceability events for every lot linked to this product, ordered by time (oldest first).',
  })
  @ApiResponse({ status: 200, description: 'Event list with product and actor details' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  findProductHistory(@Param('productId') productId: string) {
    return this.traceabilityService.findHistoryByProductId(productId);
  }
}
