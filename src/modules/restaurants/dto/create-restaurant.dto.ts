import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength, Matches, IsOptional } from 'class-validator';

export class CreateRestaurantDto {
  @ApiProperty({ example: 'Marea Alta Bistro' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiProperty({
    example: 'marea-alta-bistro',
    description: 'URL-safe slug for /trace/restaurant/:slug (lowercase, hyphens)',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase letters, numbers, and single hyphens between segments',
  })
  slug: string;

  @ApiPropertyOptional({ example: 'Guayaquil' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  location?: string;

  @ApiPropertyOptional({ example: '+593 4 123 4567' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  contact?: string;
}
