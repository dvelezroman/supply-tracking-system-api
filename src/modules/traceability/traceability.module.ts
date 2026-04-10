import { Module } from '@nestjs/common';
import { TraceabilityController } from './traceability.controller';
import { TraceabilityService } from './traceability.service';
import { TraceabilityRepository } from './traceability.repository';
import { LotsModule } from '../lots/lots.module';
import { ActorsModule } from '../actors/actors.module';

@Module({
  imports: [LotsModule, ActorsModule],
  controllers: [TraceabilityController],
  providers: [TraceabilityService, TraceabilityRepository],
})
export class TraceabilityModule {}
