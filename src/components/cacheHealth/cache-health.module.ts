import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { CacheModule } from '../cache/cache.module';
import { CacheHealthProcessor } from './cache-health.processor';
import { CacheHealthScheduler } from './cache-health.scheduler';

@Module({
    imports: [
        CacheModule,

        BullModule.registerQueue({
            name: 'cache-health',
        }),
    ],
    providers: [
        CacheHealthProcessor,
        CacheHealthScheduler,
    ],
})
export class CacheHealthModule { }