import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import path from 'path';
import { fileURLToPath } from 'url';
import redisClient, { pubClient, subClient } from './db.connect.js';
import { assertAuthEnv, getAuthConfig } from './auth/config.js';
import { buildSessionMiddleware } from './auth/session.js';
import { createAuthRouter } from './auth/routes.js';
import { requireAuth, requireSocketAuth } from './auth/requireAuth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const TOTAL_BOXES = 1000000;
const CHECK_LIMIT = 10;
const CHECK_LIMIT_WINDOW_SECONDS = 10;

assertAuthEnv();
const authConfig = getAuthConfig();
const sessionMiddleware = buildSessionMiddleware(authConfig);

io.adapter(createAdapter(pubClient, subClient));

app.set('trust proxy', 1);
app.use(express.json());
app.use(sessionMiddleware);
app.use('/auth', createAuthRouter(authConfig));
app.get('/api/me', requireAuth, (req, res) => {
    res.json({ authenticated: true });
});
app.get('/version2', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'version2.html'));
});
app.use(express.static(path.join(__dirname, 'public')));
io.engine.use(sessionMiddleware);
io.use(requireSocketAuth);

io.on('connection', async (socket) => {
    console.log('A user connected:', socket.id);

    try {
        // Fetch all boxes from Redis hash "boxes_state" when a user connects
        const boxesData = await redisClient.hgetall('boxes_state');

        // Build the array expected by the frontend (1 = checked, 0 = unchecked)
        const boxStates = new Array(TOTAL_BOXES).fill(0);
        for (const key of Object.keys(boxesData)) {
            const boxId = parseInt(key);
            if (!isNaN(boxId) && boxId >= 0 && boxId < TOTAL_BOXES) {
                boxStates[boxId] = 1;
            }
        }

        // Emit initial state back to the connected client
        socket.emit('initial_box_states', boxStates);
    } catch (err) {
        console.error('Error fetching data from Redis:', err);
        socket.emit('error', { message: 'Failed to load box states' });
    }

    socket.on('box_clicked', async (click) => {
        // Validate input
        if (!click || typeof click.index !== 'number' || !Number.isInteger(click.index)) {
            console.warn('Invalid box_clicked data:', click);
            return;
        }

        const boxId = click.index;
        const isChecked = Boolean(click.checked);
        const oidcUser = socket.request.session?.oidc?.user;
        const userId = oidcUser?.subject || socket.request.sessionID || socket.id;
        const displayName = (oidcUser?.name || oidcUser?.email || 'Signed in').substring(0, 24);

        if (boxId < 0 || boxId >= TOTAL_BOXES) {
            console.warn('Box ID out of range:', boxId);
            return;
        }

        // Save state persistently in Redis Memory Hash
        try {
            if (isChecked) {
                const rateLimitKey = `rate_limit:checks:${userId}`;
                const currentCount = await redisClient.incr(rateLimitKey);
                if (currentCount === 1) {
                    await redisClient.expire(rateLimitKey, CHECK_LIMIT_WINDOW_SECONDS);
                }

                if (currentCount > CHECK_LIMIT) {
                    const retryAfter = await redisClient.ttl(rateLimitKey);
                    socket.emit('rate_limited', {
                        message: `You can check ${CHECK_LIMIT} boxes every ${CHECK_LIMIT_WINDOW_SECONDS} seconds.`,
                        retryAfter: Math.max(retryAfter, 1),
                        index: boxId,
                    });
                    return;
                }

                await redisClient.hset('boxes_state', boxId, JSON.stringify({
                    checked: true,
                    name: displayName,
                    userId,
                    timestamp: Date.now(),
                }));
            } else {
                await redisClient.hdel('boxes_state', boxId); // Clear it if unchecked
            }
        } catch (err) {
            console.error('Error saving box state to Redis:', err);
            socket.emit('error', { message: 'Failed to save box state' });
            return;
        }

        // Emit through Redis Pub/Sub directly instead of modifying and reading memory states
        io.emit('box_clicked', { index: boxId, checked: isChecked, name: isChecked ? displayName : null });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });

    socket.on('error', (error) => {
        console.error('Socket error:', socket.id, error);
    });
});

const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    server.close(async () => {
        await redisClient.quit();
        await pubClient.quit();
        await subClient.quit();
        process.exit(0);
    });
});
