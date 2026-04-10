import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsEnum, IsOptional, IsObject, IsUUID } from 'class-validator';
import { EventType } from '@prisma/client';

export class CreateEventDto {
  @ApiProperty({ example: 'uuid-of-lot' })
  @IsUUID()
  lotId: string;

  @ApiProperty({ example: 'uuid-of-actor' })
  @IsUUID()
  actorId: string;

  @ApiProperty({ enum: EventType, example: EventType.SHIPPED })
  @IsEnum(EventType)
  eventType: EventType;

  @ApiPropertyOptional({ example: 'Centro de Distribución, Guayaquil' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ example: 'Temperatura mantenida a 4°C durante tránsito' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description: 'Flexible per-event metadata',
    examples: {
      harvested:      { value: { poolNumber: 2, harvestWeightGrams: 20.5, waterTemperature: '26°C' } },
      qualityChecked: { value: { colorSalmoFan: 'A3', texture: 'Firme', inspector: 'Juan Pérez' } },
      transported:    { value: { vehiclePlate: 'ABC-1234', departureTemp: '4°C', arrivalTemp: '4°C' } },
      stored:         { value: { chamberNumber: 3, storageTemp: '-18°C' } },
    },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
