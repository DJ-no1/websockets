import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import { randomBytes } from 'crypto';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { redis, pubClient, subClient } from './redis.js';
import { getDefaultChallenge } from './challenge.js';

const PORT = Number(process.env.PORT) || 3001;
const SESSION_TTL_SEC = 3600;
const QUEUE_KEY = 'queue:matchmaking';
const MAX_CODE_CHARS = 400_000;
const clientOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const app = express();
app.use(cors({ origin: clientOrigins, credentials: true }));
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'peercode' });
});

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: clientOrigins, methods: ['GET', 'POST'], credentials: true },
});

io.adapter(createAdapter(pubClient, subClient));

const challenge = getDefaultChallenge();

function roomStateKey(roomId) {
  return `room:${roomId}:state`;
}
function roomChatKey(roomId) {
  return `room:${roomId}:chat`;
}

function newRoomId() {
  return `rc_${randomBytes(8).toString('hex')}`;
}

/**
 * @param {import('ioredis').default} r
 * @param {string} roomId
 */
async function initActivePairedRoom(r, roomId, aUser, bUser) {
  const key = roomStateKey(roomId);
  const ckey = roomChatKey(roomId);
  const endsAt = String(Date.now() + SESSION_TTL_SEC * 1000);
  const now = String(Date.now());
  await r.hset(key, {
    a_user: aUser,
    b_user: bUser,
    a_code: challenge.starterCode,
    b_code: challenge.starterCode,
    status: 'active',
    winner_user: '',
    challenge_id: challenge.id,
    started_at: now,
    ends_at: endsAt,
  });
  await r.expire(key, SESSION_TTL_SEC);
  await r.del(ckey);
}

/**
 * @param {import('ioredis').default} r
 * @param {string} roomId
 * @param {string} aUser
 */
async function initWaitingRoom(r, roomId, aUser) {
  const key = roomStateKey(roomId);
  const now = String(Date.now());
  await r.hset(key, {
    a_user: aUser,
    b_user: '',
    a_code: challenge.starterCode,
    b_code: challenge.starterCode,
    status: 'waiting',
    winner_user: '',
    challenge_id: challenge.id,
    started_at: now,
    ends_at: '',
  });
}

function ioRoom(roomId) {
  return `room:${roomId}`;
}

function codeFieldForUser(userId, aUser, bUser) {
  if (userId === aUser) return 'a_code';
  if (bUser && userId === bUser) return 'b_code';
  return null;
}

async function getRoomState(r, roomId) {
  return r.hgetall(roomStateKey(roomId));
}

async function roomRemainingSec(r, roomId) {
  const t = await r.ttl(roomStateKey(roomId));
  if (t == null || t < 0) return 0;
  return t;
}

/**
 * @param {import('socket.io').Server} sio
 * @param {import('ioredis').default} r
 * @param {{ socketId: string, userId: string }} a
 * @param {{ socketId: string, userId: string }} b
 */
async function createPairedMatchRoom(sio, r, a, b) {
  const roomId = newRoomId();
  await initActivePairedRoom(r, roomId, a.userId, b.userId);

  for (const { socketId, userId, peerId, role } of [
    { socketId: a.socketId, userId: a.userId, peerId: b.userId, role: 'a' },
    { socketId: b.socketId, userId: b.userId, peerId: a.userId, role: 'b' },
  ]) {
    const sock = sio.sockets.sockets.get(socketId);
    if (sock) {
      sock.data.roomId = roomId;
      sock.data.userId = userId;
      sock.data.role = role;
      await sock.join(ioRoom(roomId));
      const endsAt = parseInt((await r.hget(roomStateKey(roomId), 'ends_at')) || '0', 10);
      const ttl = await r.ttl(roomStateKey(roomId));
      sock.emit('matched', {
        roomId,
        userId,
        role,
        peerId,
        problem: { title: challenge.title, statement: challenge.statement },
        starterCode: challenge.starterCode,
        testScript: challenge.testScript,
        yourCode: role === 'a' ? challenge.starterCode : challenge.starterCode,
        peerCode: role === 'a' ? challenge.starterCode : challenge.starterCode,
        endsAt,
        roomTtlSec: Math.max(0, ttl),
      });
    }
  }
}

async function processMatchQueue(sio) {
  while (true) {
    const n = await redis.llen(QUEUE_KEY);
    if (n < 2) return;
    const raw1 = await redis.lpop(QUEUE_KEY);
    const raw2 = await redis.lpop(QUEUE_KEY);
    if (!raw1 || !raw2) return;
    let a;
    let b;
    try {
      a = JSON.parse(raw1);
      b = JSON.parse(raw2);
    } catch {
      continue;
    }
    if (!a?.userId || !b?.userId) continue;
    if (a.userId === b.userId) {
      await redis.rpush(QUEUE_KEY, raw1, raw2);
      continue;
    }
    await createPairedMatchRoom(sio, redis, a, b);
  }
}

io.on('connection', (socket) => {
  socket.on('find_match', async (payload) => {
    const userId = payload && typeof payload.userId === 'string' ? payload.userId : null;
    if (!userId) {
      socket.emit('error_msg', { message: 'userId required' });
      return;
    }
    await redis.rpush(QUEUE_KEY, JSON.stringify({ socketId: socket.id, userId }));
    await processMatchQueue(io);
  });

  socket.on('create_invite', async (payload) => {
    const userId = payload && typeof payload.userId === 'string' ? payload.userId : null;
    if (!userId) {
      socket.emit('error_msg', { message: 'userId required' });
      return;
    }
    const roomId = newRoomId();
    await initWaitingRoom(redis, roomId, userId);

    socket.data.roomId = roomId;
    socket.data.userId = userId;
    socket.data.role = 'a';
    await socket.join(ioRoom(roomId));
    socket.emit('invite_created', {
      roomId,
      userId,
      role: 'a',
      problem: { title: challenge.title, statement: challenge.statement },
      starterCode: challenge.starterCode,
      testScript: challenge.testScript,
      yourCode: challenge.starterCode,
      peerCode: '',
      endsAt: 0,
      roomTtlSec: 0,
    });
  });

  socket.on('join_invite', async (payload) => {
    const roomId = payload && typeof payload.roomId === 'string' ? payload.roomId : null;
    const userId = payload && typeof payload.userId === 'string' ? payload.userId : null;
    if (!roomId || !userId) {
      socket.emit('error_msg', { message: 'roomId and userId required' });
      return;
    }
    const st = await getRoomState(redis, roomId);
    if (!st || !st.a_user) {
      socket.emit('error_msg', { message: 'Room not found' });
      return;
    }
    if (st.b_user) {
      socket.emit('error_msg', { message: 'Room is full' });
      return;
    }
    if (st.a_user === userId) {
      socket.data.roomId = roomId;
      socket.data.userId = userId;
      socket.data.role = 'a';
      await socket.join(ioRoom(roomId));
      const ends = parseInt(st.ends_at || '0', 10);
      socket.emit('matched', {
        roomId,
        userId,
        role: 'a',
        peerId: null,
        problem: { title: challenge.title, statement: challenge.statement },
        starterCode: challenge.starterCode,
        testScript: challenge.testScript,
        yourCode: st.a_code || challenge.starterCode,
        peerCode: '',
        endsAt: ends,
        roomTtlSec: await roomRemainingSec(redis, roomId),
        waitingForPeer: true,
      });
      return;
    }

    await redis.hset(roomStateKey(roomId), {
      b_user: userId,
      b_code: challenge.starterCode,
      status: 'active',
      ends_at: String(Date.now() + SESSION_TTL_SEC * 1000),
    });
    await redis.expire(roomStateKey(roomId), SESSION_TTL_SEC);
    await redis.expire(roomChatKey(roomId), SESSION_TTL_SEC);
    const fresh = await getRoomState(redis, roomId);
    const endsAt = parseInt(fresh.ends_at || '0', 10);
    const ttl = await roomRemainingSec(redis, roomId);

    const s = io.sockets.sockets.get(socket.id);
    if (s) {
      s.data.roomId = roomId;
      s.data.userId = userId;
      s.data.role = 'b';
      await s.join(ioRoom(roomId));
      s.emit('matched', {
        roomId,
        userId,
        role: 'b',
        peerId: fresh.a_user,
        problem: { title: challenge.title, statement: challenge.statement },
        starterCode: challenge.starterCode,
        testScript: challenge.testScript,
        yourCode: fresh.b_code || challenge.starterCode,
        peerCode: fresh.a_code || challenge.starterCode,
        endsAt,
        roomTtlSec: Math.max(0, ttl),
      });
    }
    const others = await io.in(ioRoom(roomId)).fetchSockets();
    const hostSocket = others.find((sk) => sk.data && sk.data.userId === fresh.a_user);
    if (hostSocket) {
      hostSocket.emit('peer_joined', {
        roomId,
        peerId: userId,
        peerCode: fresh.b_code || challenge.starterCode,
        endsAt,
        roomTtlSec: Math.max(0, ttl),
      });
    } else {
      io.to(ioRoom(roomId)).emit('peer_joined', {
        roomId,
        peerId: userId,
        peerCode: fresh.b_code || challenge.starterCode,
        endsAt,
        roomTtlSec: Math.max(0, ttl),
      });
    }
  });

  socket.on('code_update', async (payload) => {
    const roomId = payload?.roomId;
    const userId = payload?.userId;
    const code = payload?.code;
    if (typeof roomId !== 'string' || typeof userId !== 'string' || typeof code !== 'string') return;
    if (code.length > MAX_CODE_CHARS) return;
    const st = await getRoomState(redis, roomId);
    if (!st || st.status === 'done') return;
    const field = codeFieldForUser(userId, st.a_user, st.b_user);
    if (!field) return;
    await redis.hset(roomStateKey(roomId), field, code);
    socket.to(ioRoom(roomId)).emit('peer_code_update', { fromUserId: userId, code });
  });

  socket.on('chat_message', async (payload) => {
    const roomId = payload?.roomId;
    const userId = payload?.userId;
    const text = payload?.text;
    if (typeof roomId !== 'string' || typeof userId !== 'string' || typeof text !== 'string') return;
    if (text.length > 2000) return;
    const st = await getRoomState(redis, roomId);
    if (!st) return;
    if (userId !== st.a_user && userId !== st.b_user) return;
    const line = JSON.stringify({ userId, text, t: Date.now() });
    const ckey = roomChatKey(roomId);
    const skey = roomStateKey(roomId);
    await redis.rpush(ckey, line);
    await redis.ltrim(ckey, -50, -1);
    const stTtl = await redis.ttl(skey);
    if (stTtl > 0) {
      await redis.expire(ckey, stTtl);
    }
    io.to(ioRoom(roomId)).emit('chat_message', { userId, text, t: Date.now() });
  });

  socket.on('stuck_ping', (payload) => {
    const roomId = payload?.roomId;
    const userId = payload?.userId;
    if (typeof roomId !== 'string' || typeof userId !== 'string') return;
    socket.to(ioRoom(roomId)).emit('stuck_highlight', {
      fromUserId: userId,
      line: Number(payload?.line) || 0,
      ch: Number(payload?.ch) || 0,
    });
  });

  socket.on('challenge_complete', async (payload) => {
    const roomId = payload?.roomId;
    const userId = payload?.userId;
    if (typeof roomId !== 'string' || typeof userId !== 'string') return;
    const st = await getRoomState(redis, roomId);
    if (!st || st.winner_user) return;
    if (!st.b_user) return;
    if (st.status === 'waiting') return;
    if (userId !== st.a_user && userId !== st.b_user) return;
    await redis.hset(roomStateKey(roomId), { status: 'done', winner_user: userId });
    io.to(ioRoom(roomId)).emit('challenge_won', { winnerId: userId, roomId });
  });

  socket.on('restore_session', async (payload) => {
    const roomId = payload?.roomId;
    const userId = payload?.userId;
    if (typeof roomId !== 'string' || typeof userId !== 'string') return;
    const st = await getRoomState(redis, roomId);
    if (!st || !st.a_user) {
      socket.emit('restore_failed', { reason: 'missing' });
      return;
    }
    if (userId !== st.a_user && userId !== st.b_user) {
      socket.emit('restore_failed', { reason: 'forbidden' });
      return;
    }
    const role = userId === st.a_user ? 'a' : 'b';
    const peerId = userId === st.a_user ? st.b_user : st.a_user;
    socket.data.roomId = roomId;
    socket.data.userId = userId;
    socket.data.role = role;
    await socket.join(ioRoom(roomId));
    const endsAt = parseInt(st.ends_at || '0', 10);
    const yourCode = role === 'a' ? st.a_code : st.b_code;
    const peerCode = role === 'a' ? st.b_code : st.a_code;
    const lastChat = await redis.lrange(roomChatKey(roomId), 0, -1);
    const chat = [];
    for (const line of lastChat) {
      try {
        chat.push(JSON.parse(line));
      } catch {
        // ignore
      }
    }
    const ttl = await roomRemainingSec(redis, roomId);
    socket.emit('room_restored', {
      roomId,
      userId,
      role,
      peerId: peerId || null,
      status: st.status,
      winnerId: st.winner_user || null,
      problem: { title: challenge.title, statement: challenge.statement },
      starterCode: challenge.starterCode,
      testScript: challenge.testScript,
      yourCode: yourCode || challenge.starterCode,
      peerCode: peerCode || '',
      endsAt,
      roomTtlSec: Math.max(0, ttl),
      chat,
      waitingForPeer: st.status === 'waiting' && role === 'a',
    });
  });

  socket.on('disconnect', () => {
    // state remains in Redis until TTL; client uses restore_session
  });
});

httpServer.listen(PORT, () => {
  console.log(`PeerCode server http://localhost:${PORT}`);
});
