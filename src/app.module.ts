import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ProductsModule } from './modules/products/products.module';
import { ActorsModule } from './modules/actors/actors.module';
import { TraceabilityModule } from './modules/traceability/traceability.module';
import { LotsModule } from './modules/lots/lots.module';
import { PublicTraceModule } from './modules/public-trace/public-trace.module';
import { HealthModule } from './modules/health/health.module';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    ProductsModule,
    ActorsModule,
    LotsModule,
    TraceabilityModule,
    PublicTraceModule,
    HealthModule,
  ],
  providers: [RolesGuard],
})
export class AppModule {}
