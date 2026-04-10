import { Module } from '@nestjs/common';
import { LotsController } from './lots.controller';
import { LotsService } from './lots.service';
import { LotsRepository } from './lots.repository';
import { QrService } from '../../common/services/qr.service';
import { PdfService } from '../../common/services/pdf.service';

@Module({
  controllers: [LotsController],
  providers: [LotsService, LotsRepository, QrService, PdfService],
  exports: [LotsService],
})
export class LotsModule {}
