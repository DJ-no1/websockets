import Redis from 'ioredis';

const url = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

const redis = new Redis(url, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  retryStrategy(times) {
    return Math.min(times * 50, 2000);
  },
});

redis.on('error', (err) => {
  console.error('Redis error:', err);
});

const pubClient = redis.duplicate();
const subClient = redis.duplicate();
for (const c of [pubClient, subClient]) {
  c.on('error', (err) => {
    console.error('Redis pub/sub error:', err.message);
  });
}

export { redis, pubClient, subClient };
export default redis;
