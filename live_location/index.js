import http from 'node:http';
import path from 'node:path';
import { loadEnvFile } from 'node:process';

import express from 'express';
import { Server } from 'socket.io';

import { assertAuthEnv, getAuthConfig } from './auth/config.js';
import { createAuthRouter } from './auth/routes.js';
import { requireAuth, requireSocketAuth } from './auth/requireAuth.js';
import { buildSessionMiddleware } from './auth/session.js';
import { kafkaClient } from './kafka-client.js';

async function main() {
  try {
    loadEnvFile();
  } catch {
    // The host environment can still provide the OIDC values.
  }

  assertAuthEnv();

  const PORT = process.env.PORT ?? 8000;
  const authConfig = getAuthConfig();

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);
  const sessionMiddleware = buildSessionMiddleware(authConfig);

  const kafkaProducer = kafkaClient.producer();
  await kafkaProducer.connect();

  const kafkaConsumer = kafkaClient.consumer({
    groupId: `socket-server-${PORT}`,
  });
  await kafkaConsumer.connect();

  await kafkaConsumer.subscribe({
    topics: ['location-updates'],
    fromBeginning: true,
  });

  kafkaConsumer.run({
    eachMessage: async ({ topic, partition, message, heartbeat }) => {
      const data = JSON.parse(message.value.toString());
      console.log(`KafkaConsumer Data Received`, { data });
      io.emit('server:location:update', {
        id: data.id,
        latitude: data.latitude,
        longitude: data.longitude,
        name: data.name,
        image: data.image,
      });
      await heartbeat();
    },
  });

  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(sessionMiddleware);
  app.use('/auth', createAuthRouter(authConfig));

  app.get('/api/me', requireAuth, (req, res) => {
    res.json({
      authenticated: true,
      user: req.session.oidc.user,
      expiresAt: req.session.oidc.expiresAt,
      tokenType: req.session.oidc.tokenType,
    });
  });

  app.use(express.static(path.resolve('./public')));

  io.engine.use(sessionMiddleware);
  io.use(requireSocketAuth);

  io.on('connection', (socket) => {
    console.log(`[Socket:${socket.id}]: Connected Success...`);

    socket.on('client:location:update', async (locationData) => {
      const { latitude, longitude } = locationData;
      const user = socket.request.session?.oidc?.user || {};
      console.log(
        `[Socket:${socket.id}]:client:location:update:`,
        locationData,
      );

      await kafkaProducer.send({
        topic: 'location-updates',
        messages: [
          {
            key: user.subject || socket.id,
            value: JSON.stringify({
              id: user.subject || socket.id,
              latitude,
              longitude,
              name: user.name,
              image: user.picture,
            }),
          },
        ],
      });
    });
  });

  app.get('/health', (req, res) => {
    return res.json({ healthy: true });
  });

  server.listen(PORT, () =>
    console.log(`Server running on http://localhost:${PORT}`),
  );
}

main();
