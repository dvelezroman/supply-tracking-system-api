import { ApiPropertyOptional } from '@nestjs/swagger';
import { EventType } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID, IsDateString } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationDto } from '../../../common/dto/pagination.dto';

const emptyToUndefined = ({ value }: { value: unknown }) =>
  value === '' || value === null || value === undefined ? undefined : value;

export class ListEventsQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  lotId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  productId?: string;

  /** Inclusive lower bound for event `timestamp` (ISO date or datetime). */
  @ApiPropertyOptional({ example: '2026-01-15' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsDateString()
  dateFrom?: string;

  /** Inclusive upper bound for event `timestamp` (ISO date or datetime). */
  @ApiPropertyOptional({ example: '2026-04-30' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsDateString()
  dateTo?: string;

  /** Filter by lot harvest date (inclusive lower bound). */
  @ApiPropertyOptional({ example: '2026-02-01' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsDateString()
  harvestDateFrom?: string;

  /** Filter by lot harvest date (inclusive upper bound). */
  @ApiPropertyOptional({ example: '2026-02-28' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsDateString()
  harvestDateTo?: string;

  @ApiPropertyOptional({ enum: EventType })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsEnum(EventType)
  eventType?: EventType;
}
