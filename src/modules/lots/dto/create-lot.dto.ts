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
  ValidateIf,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  Presentation,
  Packaging,
  SizeClassification,
  ColorSalmoFan,
} from '@prisma/client';

export class CreateLotDto {
  @ApiPropertyOptional({
    example: 'P2-0226-PD-IQF-A',
    description:
      'Canonical lot code: P{pool}-{MMYY}-{presentation}-{packaging}[-suffix]. Omit or leave blank to auto-assign the next free code for this product (same pool / harvest month-year / presentation / packaging).',
  })
  @Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'string' && value.trim() === '') return undefined;
    return typeof value === 'string' ? value.trim() : value;
  })
  @IsOptional()
  @ValidateIf(
    (o) => o.lotCode !== undefined && o.lotCode !== null && String(o.lotCode).trim() !== '',
  )
  @IsString()
  @Matches(/^P\d+-\d{4}-[A-Z]+-[A-Z]+(-[A-Z0-9]+)?$/, {
    message: 'lotCode must follow format: P{pool}-{MMYY}-{PRESENTATION}-{PACKAGING}',
  })
  lotCode?: string;

  @ApiProperty({ example: 'uuid-of-product' })
  @IsUUID()
  productId: string;

  @ApiProperty({
    example: 'Camarón Premium',
    description:
      'Name printed on the retail packaging label (front). Not the catalogue product name.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  labelName: string;

  @ApiPropertyOptional({
    example: 'Mantener a -18°C',
    description: 'Conservation text printed below the barcode on retail and QR labels.',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'string' && value.trim() === '') return undefined;
    return typeof value === 'string' ? value.trim() : value;
  })
  @IsString()
  @MaxLength(200)
  labelConservationText?: string;

  @ApiPropertyOptional({
    example: '2026-03-01',
    description: 'Manufacturing date printed on retail and QR labels (ISO 8601 date).',
  })
  @IsOptional()
  @IsDateString()
  labelElaborationDate?: string;

  @ApiPropertyOptional({
    example: '2027-03-01',
    description: 'Expiration date printed on retail and QR labels (ISO 8601 date).',
  })
  @IsOptional()
  @IsDateString()
  labelExpirationDate?: string;

  @ApiPropertyOptional({
    example: 'Sociedad Jaramillo Minaya',
    description: 'Manufacturer line printed below net weight on retail and QR labels.',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'string' && value.trim() === '') return undefined;
    return typeof value === 'string' ? value.trim() : value;
  })
  @IsString()
  @MaxLength(200)
  labelManufacturedBy?: string;

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

  /** Actor primary keys are opaque strings (UUID from `@default(uuid())` or stable seed ids like `seed-farm-001`). */
  @ApiProperty({ example: 'seed-farm-001' })
  @IsString()
  @MinLength(1)
  @MaxLength(191)
  farmId: string;

  @ApiProperty({ example: 'seed-lab-001' })
  @IsString()
  @MinLength(1)
  @MaxLength(191)
  labId: string;

  @ApiProperty({ example: 'seed-maturation-001' })
  @IsString()
  @MinLength(1)
  @MaxLength(191)
  maturationId: string;

  @ApiProperty({ example: 'seed-copacker-001' })
  @IsString()
  @MinLength(1)
  @MaxLength(191)
  coPackerId: string;
}
