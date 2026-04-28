import { Module } from '@nestjs/common';
import { RestaurantsController } from './restaurants.controller';
import { RestaurantsService } from './restaurants.service';
import { RestaurantsRepository } from './restaurants.repository';
import { QrService } from '../../common/services/qr.service';

@Module({
  controllers: [RestaurantsController],
  providers: [RestaurantsService, RestaurantsRepository, QrService],
  exports: [RestaurantsService],
})
export class RestaurantsModule {}
