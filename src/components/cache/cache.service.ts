import {
    Injectable,
    Inject,
    Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './cache.constants';

@Injectable()
export class CacheService {
    private readonly logger = new Logger(CacheService.name);

    private hitCount = 0;
    private missCount = 0;

    constructor(
        @Inject(REDIS_CLIENT)
        private readonly redis: Redis | null,

        private readonly config: ConfigService,
    ) { }

    get enabled(): boolean {
        return this.config.get('CACHE_ENABLED') === 'true';
    }

    get defaultTTL(): number {
        return Number(
            this.config.get('CACHE_DEFAULT_TTL') || 600,
        );
    }

    /* -------------------------------- */
    /* GET */
    /* -------------------------------- */

    async get<T>(key: string): Promise<T | null> {

        if (!this.enabled || !this.redis)
            return null;

        try {

            const value = await this.redis.get(key);

            if (!value) {
                this.missCount++;
                return null;
            }

            this.hitCount++;
            return JSON.parse(value);

        } catch (err) {

            this.logger.error(err);

            return null;
        }
    }

    /* -------------------------------- */
    /* SET */
    /* -------------------------------- */

    async set(
        key: string,
        value: any,
        ttl?: number,
    ) {

        if (!this.enabled || !this.redis)
            return;

        try {

            await this.redis.set(
                key,
                JSON.stringify(value),
                "EX",
                ttl ?? this.defaultTTL,
            );

        } catch (err) {

            this.logger.error(err);

        }

    }

    /* -------------------------------- */
    /* DELETE */
    /* -------------------------------- */

    async del(key: string) {

        if (!this.enabled || !this.redis)
            return;

        try {

            await this.redis.del(key);

        } catch (err) {

            this.logger.error(err);

        }

    }

    /* -------------------------------- */
    /* DELETE MANY */
    /* -------------------------------- */

    async deleteMany(keys: string[]) {

        if (!this.enabled || !this.redis)
            return;

        if (!keys.length)
            return;

        try {

            await this.redis.del(...keys);

        } catch (err) {

            this.logger.error(err);

        }

    }

    /* -------------------------------- */
    /* DELETE PATTERN */
    /* -------------------------------- */

    async deletePattern(pattern: string) {

        if (!this.enabled || !this.redis)
            return;

        try {

            let cursor = "0";

            do {

                const result = await this.redis.scan(
                    cursor,
                    "MATCH",
                    pattern,
                    "COUNT",
                    "100",
                );

                cursor = result[0];

                const keys = result[1];

                if (keys.length) {

                    await this.redis.del(...keys);

                }

            } while (cursor !== "0");

        } catch (err) {

            this.logger.error(err);

        }

    }

    /* -------------------------------- */
    /* EXISTS */
    /* -------------------------------- */

    async exists(key: string) {

        if (!this.enabled || !this.redis)
            return false;

        return (await this.redis.exists(key)) === 1;

    }

    /* -------------------------------- */
    /* TTL */
    /* -------------------------------- */

    async ttl(key: string) {

        if (!this.enabled || !this.redis)
            return 0;

        return this.redis.ttl(key);

    }

    /* -------------------------------- */
    /* EXPIRE */
    /* -------------------------------- */

    async expire(
        key: string,
        ttl: number,
    ) {

        if (!this.enabled || !this.redis)
            return;

        await this.redis.expire(key, ttl);

    }

    /* -------------------------------- */
    /* INCREMENT */
    /* -------------------------------- */

    async increment(key: string) {

        if (!this.enabled || !this.redis)
            return 0;

        return this.redis.incr(key);

    }

    /* -------------------------------- */
    /* DECREMENT */
    /* -------------------------------- */

    async decrement(key: string) {

        if (!this.enabled || !this.redis)
            return 0;

        return this.redis.decr(key);

    }

    /* -------------------------------- */
    /* FLUSH */
    /* -------------------------------- */

    async flush() {

        if (!this.enabled || !this.redis)
            return;

        await this.redis.flushdb();

    }

    /* -------------------------------- */
    /* REMEMBER */
    /* -------------------------------- */

    async remember<T>(
        key: string,
        callback: () => Promise<T>,
        ttl?: number,
    ): Promise<T> {

        if (!this.enabled || !this.redis) {

            return callback();

        }

        const cached = await this.get<T>(key);

        if (cached !== null) {

            return cached;

        }

        const result = await callback();

        await this.set(
            key,
            result,
            ttl,
        );

        return result;

    }

    /* -------------------------------- */
    /* GET OR SET */
    /* -------------------------------- */

    async getOrSet<T>(
        key: string,
        value: T,
        ttl?: number,
    ): Promise<T> {

        const cache = await this.get<T>(key);

        if (cache)
            return cache;

        await this.set(
            key,
            value,
            ttl,
        );

        return value;

    }

    /* -------------------------------- */
    /* LOCK */
    /* -------------------------------- */

    async acquireLock(
        key: string,
        ttl = 10,
    ): Promise<boolean> {

        if (!this.enabled || !this.redis)
            return true;

        const result = await this.redis.set(
            `lock:${key}`,
            "1",
            "EX",
            ttl,
            "NX",
        );

        return result === "OK";

    }

    /* -------------------------------- */
    /* RELEASE LOCK */
    /* -------------------------------- */

    async releaseLock(
        key: string,
    ) {

        if (!this.enabled || !this.redis)
            return;

        await this.redis.del(
            `lock:${key}`,
        );

    }

    /* -------------------------------- */
    /* REMEMBER WITH LOCK */
    /* -------------------------------- */

    async rememberWithLock<T>(
        key: string,
        callback: () => Promise<T>,
        ttl?: number,
    ): Promise<T> {

        if (!this.enabled || !this.redis) {
            console.log('⚪ CACHE DISABLED');
            return callback();
        }

        // Check cache first
        const cached = await this.get<T>(key);

        if (cached) {
            console.log(`🟢 CACHE HIT : ${key}`);
            return cached;
        }

        console.log(`🔴 CACHE MISS : ${key}`);

        const lock = await this.acquireLock(key);

        if (!lock) {
            console.log(`🟡 WAITING FOR CACHE : ${key}`);

            for (let i = 0; i < 20; i++) {
                await new Promise(resolve => setTimeout(resolve, 100));

                const retry = await this.get<T>(key);

                if (retry) {
                    console.log(`🟢 CACHE HIT AFTER WAIT : ${key}`);
                    return retry;
                }
            }

            console.log(`🔴 LOCK TIMEOUT, LOADING DB : ${key}`);
            return callback();
        }

        try {
            console.log(`📦 LOADING FROM DATABASE : ${key}`);

            const result = await callback();

            console.log(`💾 SAVING TO CACHE : ${key}`);

            await this.set(key, result, ttl);

            return result;
        } finally {
            await this.releaseLock(key);
        }
    }



    /* -------------------------------- */
    /* PING */
    /* -------------------------------- */

    async ping() {
        if (!this.enabled || !this.redis) {
            return {
                cacheEnabled: false,
                redisConnected: false,
            };
        }

        try {
            const pong = await this.redis.ping();

            return {
                cacheEnabled: true,
                redisConnected: pong === 'PONG',
            };
        } catch (err: any) {
            return {
                cacheEnabled: true,
                redisConnected: false,
                error: err.message,
            };
        }
    }

    /* -------------------------------- */
    /* GET KEYS */
    /* -------------------------------- */

    async keys(pattern = '*') {
        if (!this.enabled || !this.redis) return [];

        return this.redis.keys(pattern);
    }

    /* -------------------------------- */
    /* CACHE STATS */
    /* -------------------------------- */

    async stats() {
        if (!this.enabled || !this.redis) {
            return {
                enabled: false,
            };
        }

        const info = await this.redis.info("memory");
        const dbSize = await this.redis.dbsize();


        const memoryInfo = info
            .split("\r\n")
            .filter((line) => line && !line.startsWith("#"))
            .reduce((acc, line) => {
                const [key, value] = line.split(":");
                acc[key] = value;
                return acc;
            }, {} as Record<string, string>);

        return {
            enabled: true,

            cache: {
                keys: dbSize,
                hits: this.hitCount,
                misses: this.missCount,
                hitRate:
                    this.hitCount + this.missCount > 0
                        ? `${(
                            (this.hitCount /
                                (this.hitCount + this.missCount)) *
                            100
                        ).toFixed(2)}%`
                        : "0%",
            },

            memory: {
                used: memoryInfo.used_memory_human,
                peak: memoryInfo.used_memory_peak_human,
                rss: memoryInfo.used_memory_rss_human,
                max: memoryInfo.maxmemory_human,
                fragmentation: memoryInfo.mem_fragmentation_ratio,
                allocator: memoryInfo.mem_allocator,
            },
        };
    }

    /* -------------------------------- */
    /* CLEAR ALL */
    /* -------------------------------- */

    async clear() {
        if (!this.enabled || !this.redis) return;

        await this.redis.flushdb();

        return {
            success: true,
            message: 'Cache Cleared',
        };
    }

}