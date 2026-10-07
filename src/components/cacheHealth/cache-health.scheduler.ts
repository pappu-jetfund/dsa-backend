import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class CacheHealthScheduler implements OnModuleInit {
    constructor(
        @InjectQueue('cache-health')
        private readonly queue: Queue,
    ) { }

    async onModuleInit() {
        // await this.queue.upsertJobScheduler(
        //     'cache-health-monitor',
        //     {
        //         every: 60000,
        //     },
        //     {
        //         name: 'redis-health',
        //     },

        // );
    }
}