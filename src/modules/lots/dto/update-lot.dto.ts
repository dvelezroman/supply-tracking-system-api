import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateLotDto } from './create-lot.dto';

// lotCode and productId are immutable after creation
export class UpdateLotDto extends PartialType(
  OmitType(CreateLotDto, ['lotCode', 'productId'] as const),
) {}
