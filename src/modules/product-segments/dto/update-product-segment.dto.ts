import { PartialType } from '@nestjs/mapped-types';
import { CreateProductSegmentDto } from './create-product-segment.dto';

export class UpdateProductSegmentDto extends PartialType(CreateProductSegmentDto) {}
