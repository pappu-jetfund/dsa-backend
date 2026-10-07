import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { MetricsService } from './metrics.service';
import { PROFILING_DASHBOARD } from './profiling-dashboard';

@Controller('profiling')
export class ProfilingController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  dashboard(@Res() response: Response) {
    response.type('html').send(PROFILING_DASHBOARD);
  }

  @Get('data')
  dashboardData(): unknown {
    return this.metrics.snapshot();
  }
}
