import {
    Controller,
    Delete,
    Get,
    Param,
} from '@nestjs/common';

import { CacheService } from './cache.service';

@Controller('cache')
export class CacheController {
    constructor(
        private readonly cache: CacheService,
    ) { }

    @Get('status')
    async status() {
        return this.cache.ping();
    }

    @Get('keys')
    async keys() {
        return this.cache.keys();
    }

    @Get('stats')
    async stats() {
        return this.cache.stats();
    }

    @Delete('clear')
    async clear() {
        return this.cache.clear();
    }

    @Delete('lead/:tenant/:leadID')
    async clearLead(
        @Param('tenant') tenant: string,
        @Param('leadID') leadID: string,
    ) {
        await this.cache.deletePattern(
            `lms:${tenant}:lead:*:${leadID}`,
        );

        return {
            success: true,
            message: 'Lead Cache Cleared',
        };
    }
}