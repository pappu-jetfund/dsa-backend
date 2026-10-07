import Redis from 'ioredis';
import { randomUUID } from 'crypto';

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT || 6379),
  db: Number(process.env.REDIS_DB || 0),
  password: process.env.REDIS_PASSWORD || undefined,
});
const lockTokens = new Map<string, string>();

export async function acquireLock(
    key: string,
    ttl: number,
): Promise<boolean> {
    const token = randomUUID();

    const result = await redis.set(key, token, 'PX', ttl, 'NX');

    if (result === 'OK') {
        lockTokens.set(key, token);
        return true;
    }

    return false;
}


export async function releaseLock(key: string) {
    const token = lockTokens.get(key);
    if (!token) return;

    const luaScript = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

    await redis.eval(luaScript, 1, key, token);

    lockTokens.delete(key);
}
