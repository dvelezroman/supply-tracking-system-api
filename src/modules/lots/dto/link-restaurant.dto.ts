import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class LinkRestaurantDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  restaurantId: string;
}
