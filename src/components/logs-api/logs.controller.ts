import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { LogsService } from './logs.service';
import { AuthGuard } from '../../gaurd/auth.gaurd';

@Controller('logs')
export class LogsController {
  constructor(private readonly logsService: LogsService) { }

  @UseGuards(AuthGuard)
  @Get()
  getLogs(@Query('date') date?: string) {
    return this.logsService.getLogsByDate(date);
  }
}
