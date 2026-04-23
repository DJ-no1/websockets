// redis setup and connection logic
import Redis from 'ioredis';

const redis = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
    retryStrategy(times) {
        return Math.min(times * 50, 2000);
    },
    connectTimeout: 10000,
});

redis.on('connect', () => {
    console.log('Connected to Redis successfully!');
});

redis.on('ready', () => {
    console.log('Redis client is ready.');
});

redis.on('error', (err) => {
    console.error('Redis connection error:', err);
});

export const pubClient = redis.duplicate();
export const subClient = redis.duplicate();

export default redis;