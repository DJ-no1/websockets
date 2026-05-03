// redis setup and connection logic
import Redis from 'ioredis';

//my previous way of creating a single Redis client, but we need two clients for pub/sub functionality

// const redis = new Redis({
//     host: process.env.REDIS_HOST || '127.0.0.1',
//     port: process.env.REDIS_PORT || 6379,
//     retryStrategy(times) {
//         return Math.min(times * 50, 2000);
//     },
//     connectTimeout: 10000,
// });

//create a funtion to create a new Redis client then we will export them as publisher and subscriber clients



function createRedisConnection() {
    const redis = new Redis({
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: process.env.REDIS_PORT || 6379,
        retryStrategy(times) {
            return Math.min(times * 50, 2000);
        }
    })
    return redis
};


const redis = createRedisConnection();


redis.on('connect', () => {
    console.log('Connected to Redis successfully!');
});

redis.on('ready', () => {
    console.log('Redis client is ready.');
});

redis.on('error', (err) => {
    console.error('Redis connection error:', err);
});

export const pubClient = createRedisConnection();
export const subClient = createRedisConnection();

export default redis;