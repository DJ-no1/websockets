import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import path from 'path';
import { fileURLToPath } from 'url';
import redisClient, { pubClient, subClient } from './db.connect.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const MAX_BOXES = 10000;

io.adapter(createAdapter(pubClient, subClient));

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', async (socket) => {
    console.log('A user connected:', socket.id);

    try {
        // Fetch all boxes from Redis hash "boxes_state" when a user connects
        const boxesData = await redisClient.hgetall('boxes_state');
        
        // Build the array expected by the frontend (1 = checked, 0 = unchecked)
        const boxStates = new Array(MAX_BOXES).fill(0);
        for (const key of Object.keys(boxesData)) {
            boxStates[parseInt(key)] = 1;
        }
        
        // Emit initial state back to the connected client
        socket.emit('initial_box_states', boxStates);
    } catch (err) {
        console.error('Error fetching data from Redis:', err);
    }

    socket.on('box_clicked', async (click) => {
        if (!click || typeof click.index !== 'number' || !Number.isInteger(click.index)) {
            return;
        }

        const boxId = click.index;
        const isChecked = Boolean(click.checked);
        const name = typeof click.name === 'string' ? click.name : 'Anon';

        if (boxId < 0 || boxId >= MAX_BOXES) {
            return;
        }

        // Save state persistently in Redis Memory Hash
        try {
            if (isChecked) {
                await redisClient.hset('boxes_state', boxId, JSON.stringify({ checked: true, name }));
            } else {
                await redisClient.hdel('boxes_state', boxId); // Clear it if unchecked
            }
        } catch (err) {
            console.error('Error saving box state:', err);
        }

        // Emit through Redis Pub/Sub directly instead of modifying and reading memory states
        io.emit('box_clicked', { index: boxId, checked: isChecked, name: isChecked ? name : null });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
