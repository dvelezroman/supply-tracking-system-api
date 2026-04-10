import { Module } from '@nestjs/common';
import { ActorsController } from './actors.controller';
import { ActorsService } from './actors.service';
import { ActorsRepository } from './actors.repository';

@Module({
  controllers: [ActorsController],
  providers: [ActorsService, ActorsRepository],
  exports: [ActorsService],
})
export class ActorsModule {}
