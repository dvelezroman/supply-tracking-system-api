import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsUUID,
  IsNumber,
  IsInt,
  IsPositive,
  IsDateString,
  IsOptional,
  IsArray,
  Matches,
} from 'class-validator';
import {
  Presentation,
  Packaging,
  SizeClassification,
  ColorSalmoFan,
} from '@prisma/client';

export class CreateLotDto {
  @ApiProperty({
    example: 'P2-0226-PD-IQF-A',
    description: 'Canonical lot code: P{pool}-{MMYY}-{presentation}-{packaging}[-suffix]',
  })
  @IsString()
  @Matches(/^P\d+-\d{4}-[A-Z]+-[A-Z]+(-[A-Z0-9]+)?$/, {
    message: 'lotCode must follow format: P{pool}-{MMYY}-{PRESENTATION}-{PACKAGING}',
  })
  lotCode: string;

  @ApiProperty({ example: 'uuid-of-product' })
  @IsUUID()
  productId: string;

  @ApiProperty({ enum: Presentation, example: Presentation.PD_TAIL_OFF })
  @IsEnum(Presentation)
  presentation: Presentation;

  @ApiProperty({ enum: Packaging, example: Packaging.IQF })
  @IsEnum(Packaging)
  packaging: Packaging;

  @ApiProperty({ example: 2.27, description: 'Unit weight in Kg' })
  @IsNumber()
  @IsPositive()
  weightKg: number;

  @ApiProperty({ enum: SizeClassification, example: SizeClassification.S31_35 })
  @IsEnum(SizeClassification)
  sizeClassification: SizeClassification;

  @ApiProperty({ enum: ColorSalmoFan, example: ColorSalmoFan.A3 })
  @IsEnum(ColorSalmoFan)
  colorSalmoFan: ColorSalmoFan;

  @ApiPropertyOptional({ example: 'Firme / Crujiente' })
  @IsOptional()
  @IsString()
  texture?: string;

  @ApiPropertyOptional({ example: ['SCI - GR-1823'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  certifications?: string[];

  @ApiProperty({ example: 952, description: 'Total lot size in pounds' })
  @IsNumber()
  @IsPositive()
  lotSizeLbs: number;

  @ApiProperty({ example: '2026-02-20', description: 'ISO 8601 harvest date' })
  @IsDateString()
  harvestDate: string;

  @ApiProperty({ example: 2, description: 'Farm pool number' })
  @IsInt()
  @IsPositive()
  poolNumber: number;

  @ApiProperty({ example: 20.5, description: 'Individual shrimp harvest weight in grams' })
  @IsNumber()
  @IsPositive()
  harvestWeightGrams: number;

  @ApiProperty({ example: 'uuid-of-farm-actor' })
  @IsUUID()
  farmId: string;

  @ApiProperty({ example: 'uuid-of-lab-actor' })
  @IsUUID()
  labId: string;

  @ApiProperty({ example: 'uuid-of-maturation-actor' })
  @IsUUID()
  maturationId: string;

  @ApiProperty({ example: 'uuid-of-copacker-actor' })
  @IsUUID()
  coPackerId: string;
}
