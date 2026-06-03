import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

function trimOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return value as string;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export class PatchRetailLabelDto {
  @ApiPropertyOptional({
    example: 'Camarón Premium',
    description: 'Front title on the retail label. Falls back to product name when unset.',
    nullable: true,
  })
  @IsOptional()
  @Transform(({ value }) => trimOptionalString(value))
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(120)
  labelTitle?: string | null;

  @ApiPropertyOptional({
    example: '5931234567890',
    description: '13-digit EAN-13 (GS1). Validated including check digit.',
    nullable: true,
  })
  @IsOptional()
  @Transform(({ value }) => trimOptionalString(value))
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(32)
  labelGtin13?: string | null;

  @ApiPropertyOptional({
    example: 32,
    description: 'Net weight in ounces (label copy).',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsNumber()
  @IsPositive()
  labelNetWeightOz?: number | null;

  @ApiPropertyOptional({
    example: 2,
    description: 'Net weight in pounds (label copy).',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsNumber()
  @IsPositive()
  labelNetWeightLbs?: number | null;

  @ApiPropertyOptional({
    example: 'En trámite',
    description: 'ARCSA sanitary notification code or status line.',
    nullable: true,
  })
  @IsOptional()
  @Transform(({ value }) => trimOptionalString(value))
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(120)
  labelSanitaryArcsa?: string | null;
}
