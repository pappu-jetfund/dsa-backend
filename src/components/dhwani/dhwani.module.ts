// dhwani.module.ts
import { Module } from '@nestjs/common';
import { DhwaniCronService } from './dhwani.cron.service';
import { DhwaniController } from './dhwani.controller';
import { DhwaniService } from './dhwani.service';

@Module({
    providers: [DhwaniCronService, DhwaniService],
    controllers: [DhwaniController],
    exports: [DhwaniCronService],
})
export class DhwaniModule { }