import { Module } from '@nestjs/common';
import { ProductSegmentsController } from './product-segments.controller';
import { ProductSegmentsService } from './product-segments.service';
import { ProductSegmentsRepository } from './product-segments.repository';

@Module({
  controllers: [ProductSegmentsController],
  providers: [ProductSegmentsService, ProductSegmentsRepository],
  exports: [ProductSegmentsService],
})
export class ProductSegmentsModule {}
