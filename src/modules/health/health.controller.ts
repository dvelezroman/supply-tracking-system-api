import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Full health check (app + database)' })
  @ApiResponse({ status: 200, description: 'All systems healthy' })
  @ApiResponse({ status: 503, description: 'One or more systems degraded' })
  check() {
    return this.healthService.check();
  }

  @Get('ping')
  @ApiOperation({ summary: 'Lightweight liveness probe — no DB call' })
  @ApiResponse({ status: 200, description: 'API process is alive' })
  ping() {
    return this.healthService.ping();
  }
}
