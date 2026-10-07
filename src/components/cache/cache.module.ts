import { Global, Module } from '@nestjs/common';
import { CacheService } from './cache.service';
import { CacheController } from './cache.controller';
import { RedisProvider } from './redis.provider';

@Global()
@Module({
    controllers: [CacheController], // 👈 Add this
    providers: [
        RedisProvider,
        CacheService,
    ],
    exports: [CacheService],
})
export class CacheModule { }