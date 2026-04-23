# Socket.io — Practical Guide & Examples

A concise, blog-style tour of what you can build with Socket.io and how to get started fast. Clear examples show server and client patterns, common features, and best practices.

## Why Socket.io
- Real-time, bidirectional communication between browser and server.
- Automatic transport fallback (WebSocket -> polling).
- Built-in features: rooms, namespaces, acknowledgements, middlewares.

## Quick Start (server)
```js
import express from 'express'
import http from 'http'
import { Server } from 'socket.io'

const app = express()
const server = http.createServer(app)
const io = new Server(server, { cors: { origin: '*' } })

io.on('connection', (socket) => {
  console.log('connected', socket.id)

  socket.on('message', (msg) => io.emit('message', msg))
})

server.listen(3000)
```

## Quick Start (client)
```html
<script src="/socket.io/socket.io.js"></script>
<script>
  const socket = io('http://localhost:3000')
  socket.on('connect', () => console.log('connected'))
  socket.emit('message', 'hello from client')
  socket.on('message', msg => console.log('msg', msg))
</script>
```

## Common Patterns

- Basic chat: emit `message`, server broadcasts with `io.emit`.
- Private messages: `socket.to(targetSocketId).emit('msg', data)`.
- Rooms: `socket.join('room1')`, then `io.to('room1').emit(...)`.
- Namespaces: `const nsp = io.of('/nsp')` for separate channels and auth.

### Rooms example
```js
socket.join('game:123')
io.to('game:123').emit('state', gameState)
```

### Broadcasting
- `socket.broadcast.emit('event', data)` — everywhere except sender.
- `io.emit('event', data)` — to everyone.
- `socket.to(room).emit(...)` — to a room except sender.

## Acknowledgements (callbacks)
```js
// client
socket.emit('calc', { a:1,b:2 }, (res) => console.log('result', res))

// server
socket.on('calc', (data, ack) => {
  const sum = data.a + data.b
  ack({ sum })
})
```

## Middleware & Authentication
```js
io.use((socket, next) => {
  const token = socket.handshake.auth.token
  if (isValid(token)) return next()
  next(new Error('unauthorized'))
})
```

## Scaling (short)
- For multi-process or multi-server, use an adapter (Redis adapter): `socket.io-redis`.
- Adapter propagates events and room-joins across nodes.

## Binary & Large Data
- Socket.io supports binary (ArrayBuffer, Blob, Buffer) without manual serialization.

## TypeScript Tips
- Use `import { Server, Socket } from 'socket.io'` and type events via interfaces.

## Security & Best Practices
- Enable CORS carefully (`origin` whitelist).
- Validate and sanitize all incoming events.
- Use rate-limiting / per-socket quotas if needed.
- Avoid trusting client IDs; use server-side room membership checks.

## Reliability & Reconnection
- Socket.io handles reconnection by default. Tune `reconnectionAttempts`, `reconnectionDelay` client options.

## Dev & Debugging Tools
- Use `nodemon` for server auto-restart during development.
- Inspect handshake and `socket.id` for tracing.

## Example Projects & Use Cases
- Chat apps, collaborative editors, live dashboards, multiplayer games, notifications, presence systems.

## Minimal Recipes
- Heartbeat / presence: emit heartbeat pings and track active sockets in a room.
- Typing indicator: emit `typing` with username and broadcast to room.

---
If you want, I can:
- Add runnable client HTML that connects to `index.js`.
- Add a TypeScript-typed example and intro to Redis adapter setup.
