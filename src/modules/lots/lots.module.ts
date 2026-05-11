import { Module } from '@nestjs/common';
import { LotsController } from './lots.controller';
import { LotsService } from './lots.service';
import { LotsRepository } from './lots.repository';
import { LotAvailabilityService } from './lot-availability.service';
import { QrService } from '../../common/services/qr.service';
import { PdfService } from '../../common/services/pdf.service';

@Module({
  controllers: [LotsController],
  providers: [
    LotsService,
    LotsRepository,
    LotAvailabilityService,
    QrService,
    PdfService,
  ],
  exports: [LotsService, LotAvailabilityService],
})
export class LotsModule {}
