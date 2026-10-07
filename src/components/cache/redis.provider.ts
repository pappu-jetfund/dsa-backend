import Redis from 'ioredis';
import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { REDIS_CLIENT } from './cache.constants';

export const RedisProvider: Provider = {
    provide: REDIS_CLIENT,

    inject: [ConfigService],

    useFactory: async (config: ConfigService) => {
        const enabled =
            config.get<string>('CACHE_ENABLED') === 'true';

        if (!enabled) {
            console.log('⚠ Cache Disabled');
            return null;
        }

        const redis = new Redis({
            host: config.get('REDIS_HOST'),
            port: Number(config.get('REDIS_PORT')),
            password:
                config.get('REDIS_PASSWORD') || undefined,
            db: Number(config.get('REDIS_DB')),

            lazyConnect: true,

            maxRetriesPerRequest: null,

            enableReadyCheck: true,

            retryStrategy(times) {
                return Math.min(times * 100, 3000);
            },
        });

        redis.on('connect', () => {
            console.log('✅ Redis Connected');
        });

        redis.on('error', (err) => {
            console.log('Redis Error', err);
        });

        await redis.connect();

        return redis;
    },
};