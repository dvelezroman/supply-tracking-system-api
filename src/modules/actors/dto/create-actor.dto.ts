import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsEnum, IsOptional, IsObject } from 'class-validator';
import { ActorType } from '@prisma/client';

export class CreateActorDto {
  @ApiProperty({ example: 'Fresh Farms Co.' })
  @IsString()
  name: string;

  @ApiProperty({ enum: ActorType, example: ActorType.SUPPLIER })
  @IsEnum(ActorType)
  type: ActorType;

  @ApiPropertyOptional({ example: 'California, USA' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ example: 'contact@freshfarms.com' })
  @IsOptional()
  @IsString()
  contact?: string;

  @ApiPropertyOptional({ example: { licenseNumber: 'CA-1234' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
