import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsUUID, IsInt, IsPositive, IsDateString, IsEnum } from 'class-validator';
import { Presentation, Packaging } from '@prisma/client';

export class SuggestLotCodeQueryDto {
  @ApiProperty()
  @IsUUID()
  productId: string;

  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  poolNumber: number;

  @ApiProperty({ example: '2026-02-20' })
  @IsDateString()
  harvestDate: string;

  @ApiProperty({ enum: Presentation })
  @IsEnum(Presentation)
  presentation: Presentation;

  @ApiProperty({ enum: Packaging })
  @IsEnum(Packaging)
  packaging: Packaging;
}
