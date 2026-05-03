# Live Location Sharing

A real-time location sharing app built with Express, Socket.IO, Kafka, Leaflet, and OIDC authentication. Users sign in through an OpenID Connect provider, share their browser geolocation, and see other authenticated users update live on a map.

## Project Overview

This project demonstrates authenticated real-time location streaming:

- The browser checks the current OIDC session before enabling the map.
- Authenticated users connect to Socket.IO using the same Express session cookie.
- The client sends location coordinates every 10 seconds.
- The server publishes each location update to Kafka.
- The server consumes Kafka location events and broadcasts them to all connected clients.
- The frontend renders the signed-in user and remote users on a Leaflet map.

## Tech Stack

- **Runtime:** Node.js with ES modules
- **Server:** Express 5
- **Realtime:** Socket.IO
- **Messaging:** Kafka with KafkaJS
- **Auth:** OpenID Connect using `openid-client`
- **Sessions:** `express-session`
- **Map UI:** Leaflet and OpenStreetMap tiles
- **Package manager:** pnpm
- **Local infrastructure:** Docker Compose for Kafka

## Setup Steps

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Start Kafka:

   ```bash
   docker compose up -d
   ```

3. Create the Kafka topic:

   ```bash
   node kafka-admin.js
   ```

4. Create a `.env` file in the project root and fill in the required values listed below.

5. Start the app:

   ```bash
   pnpm dev
   ```

6. Open the app:

   ```text
   http://localhost:8000
   ```

7. Optional: run the sample database processor in a separate terminal to observe Kafka events:

   ```bash
   node database-processor.js
   ```

## Environment Variables

Required:

```env
OIDC_ISSUER_URL=https://your-issuer.example.com
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret
OIDC_REDIRECT_URI=http://localhost:8000/auth/callback
SESSION_SECRET=replace-with-a-long-random-secret
```

Optional:

```env
PORT=8000
OIDC_POST_LOGOUT_REDIRECT_URI=http://localhost:8000/auth/callback
OIDC_SCOPE=openid profile email
OIDC_ALLOW_INSECURE_HTTP=false
NODE_ENV=development
```

Notes:

- `SESSION_SECRET` should be a strong random value.
- `OIDC_ALLOW_INSECURE_HTTP=true` is only useful for local OIDC providers that do not use HTTPS.
- In production, set `NODE_ENV=production` so the session cookie is marked secure. Production deployments must run behind HTTPS.

## OIDC Auth Setup

Create an application/client in your OIDC provider with these settings:

- **Application type:** Web application or confidential client
- **Grant type:** Authorization Code with PKCE
- **Redirect URI:** `http://localhost:8000/auth/callback`
- **Post logout redirect URI:** match `OIDC_POST_LOGOUT_REDIRECT_URI`, if your provider supports logout redirects
- **Scopes:** `openid profile email`

Auth routes:

- `GET /auth/login` starts the OIDC login flow.
- `GET /auth/callback` exchanges the authorization code and stores the user profile in the session.
- `GET /auth/me` returns the current session state for the frontend.
- `POST /auth/logout` destroys the local session and redirects to the provider logout endpoint when available.

The server also exposes `GET /api/me`, protected by `requireAuth`, for authenticated API session inspection.

## Socket Event Flow

1. The frontend calls `GET /auth/me`.
2. If authenticated, the frontend connects to Socket.IO.
3. Socket.IO reuses the Express session middleware.
4. `requireSocketAuth` rejects unauthenticated socket connections.
5. The browser reads geolocation through `navigator.geolocation`.
6. Every 10 seconds, the client emits:

   ```text
   client:location:update
   ```

   Payload:

   ```json
   {
     "latitude": 28.6139,
     "longitude": 77.209
   }
   ```

7. The server enriches the event with the authenticated user's subject, name, and profile image.
8. After Kafka receives and replays the message, the server emits:

   ```text
   server:location:update
   ```

   Payload:

   ```json
   {
     "id": "oidc-sub-or-socket-id",
     "latitude": 28.6139,
     "longitude": 77.209,
     "name": "User Name",
     "image": "https://example.com/avatar.png"
   }
   ```

9. Other clients update or create a marker for that user on the map.

## Kafka Event Flow

Kafka broker:

- Runs locally through Docker Compose on `localhost:9092`.
- Uses the `apache/kafka:4.2.0` image.

Topic:

- `location-updates`
- Created by `kafka-admin.js`
- Configured with 2 partitions

Producer flow:

1. `index.js` connects a Kafka producer on startup.
2. When a socket receives `client:location:update`, the server sends a message to `location-updates`.
3. The Kafka message key is the OIDC subject when available, otherwise the socket id.
4. The Kafka message value contains `id`, `latitude`, `longitude`, `name`, and `image`.

Consumer flow:

1. `index.js` starts a Kafka consumer with group id `socket-server-${PORT}`.
2. The consumer subscribes to `location-updates` from the beginning.
3. Every consumed message is parsed and broadcast to connected Socket.IO clients with `server:location:update`.
4. `database-processor.js` is a sample consumer with group id `database-processor`; it currently logs an `INSERT INTO DB LOCATION` message and can be extended to persist events.

## Demo Video Link

Demo video: **TBD**

Add your recorded demo link here after uploading it.

## Assumptions and Limitations

- Kafka is expected to be available at `localhost:9092`.
- The Kafka broker configuration is intended for local development, not production clustering.
- Session data uses the default in-memory `express-session` store, which is not suitable for production.
- The browser must grant geolocation permission before live updates can be sent.
- Location updates are sent every 10 seconds; continuous GPS tracking with `watchPosition` is not currently used.
- The app does not persist locations unless `database-processor.js` is extended with database writes.
- Remote markers are updated while users send events, but stale users are not automatically removed.
- Profile images are detected from common OIDC userinfo fields, but the UI currently renders initial-based markers.
- The server subscribes with `fromBeginning: true`, so restarted consumers may replay older location events.
- Socket authorization depends on the Express session cookie, so cross-domain deployments require careful cookie and proxy configuration.
