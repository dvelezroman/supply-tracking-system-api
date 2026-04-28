import { PartialType, OmitType } from '@nestjs/mapped-types';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';
import { CreateEventDto } from './create-event.dto';

/** All fields optional; `lotId` cannot be changed. */
export class UpdateEventDto extends PartialType(
  OmitType(CreateEventDto, ['lotId'] as const),
) {
  @ApiPropertyOptional({ description: 'When the event occurred (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  timestamp?: string;
}
