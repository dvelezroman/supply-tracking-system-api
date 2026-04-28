import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class RestaurantQueryDto extends PaginationDto {
  /** Wider cap than base PaginationDto (100) for admin-style full lists. */
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  override limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Filter by name or slug (contains, case-insensitive)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
