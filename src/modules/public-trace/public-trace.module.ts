import { Module } from '@nestjs/common';
import { PublicTraceController } from './public-trace.controller';
import { PublicTraceService } from './public-trace.service';
import { LotsModule } from '../lots/lots.module';
import { QrService } from '../../common/services/qr.service';

@Module({
  imports: [LotsModule],
  controllers: [PublicTraceController],
  providers: [PublicTraceService, QrService],
})
export class PublicTraceModule {}
