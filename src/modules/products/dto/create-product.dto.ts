import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsObject } from 'class-validator';

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

  @ApiPropertyOptional({ example: { origin: 'California', certifications: ['USDA Organic'] } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
