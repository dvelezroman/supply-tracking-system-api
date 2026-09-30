import { Module } from '@nestjs/common';
import { PayphoneService } from './payphone.service';

@Module({
  providers: [PayphoneService],
  exports: [PayphoneService],
})
export class PayphoneModule {}
