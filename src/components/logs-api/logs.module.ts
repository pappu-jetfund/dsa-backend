import { Module } from '@nestjs/common';
import { LogsController } from './logs.controller';
import { LogsService } from './logs.service';
import { FailureLogService } from './failure-log.service';

@Module({
  controllers: [LogsController],
  providers: [LogsService, FailureLogService],
  exports: [LogsService, FailureLogService],
})
export class LogsModule {}
