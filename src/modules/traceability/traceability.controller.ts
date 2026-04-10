import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { TraceabilityService } from './traceability.service';
import { CreateEventDto } from './dto/create-event.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PaginationDto } from '../../common/dto/pagination.dto';

class EventQueryDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  lotId?: string;
}

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
  @ApiOperation({ summary: 'List all events (paginated, optional filter by lot)' })
  @ApiQuery({ name: 'lotId', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiResponse({ status: 200, description: 'Paginated event list with lot, product and actor details' })
  findAll(@Query() query: EventQueryDto) {
    return this.traceabilityService.findAll(query.page, query.limit, query.lotId);
  }
}
