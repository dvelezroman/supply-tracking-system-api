import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsObject, IsUUID, ValidateIf } from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ example: 'ORG-APPLE-001' })
  @IsString()
  sku: string;

  @ApiProperty({ example: 'Organic Apples' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Premium organic Fuji apples' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'Fresh Produce' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Product segment ID (e.g. Camarón, Otros)',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  segmentId?: string | null;

  @ApiPropertyOptional({ example: { origin: 'California', certifications: ['USDA Organic'] } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
