import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { CacheService } from '../cache/cache.service';

@Processor('cache-health')
export class CacheHealthProcessor extends WorkerHost {
    constructor(
        private readonly cache: CacheService,
    ) {
        super();
    }

    async process(job: Job) {
        return await this.cache.stats();
    }
}