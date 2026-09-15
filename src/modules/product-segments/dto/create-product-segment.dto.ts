import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength } from 'class-validator';

export class CreateProductSegmentDto {
  @ApiProperty({ example: 'Camarón' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;
}
