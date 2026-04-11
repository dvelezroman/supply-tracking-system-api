import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

export class PatchPublicVisibilityDto {
  @ApiProperty({
    description: 'Partial map of visibility flags (see API docs / PUBLIC_VISIBILITY_KEYS)',
    example: { showProductSku: false, showTraceTimeline: true },
  })
  @IsObject()
  patch: Record<string, boolean>;
}
