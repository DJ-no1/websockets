# C Box - 1 Million Boxes

A real-time collaborative web app where authenticated users can check and uncheck boxes on a shared 1,000,000-box canvas. Box state is persisted in Redis, synchronized across connected clients with Socket.IO, and protected by OpenID Connect authentication plus Redis-backed rate limiting.

#video link : https://youtu.be/V4dsz5de3o0


## Tech Stack

- **Node.js** with **Express 5**
- **Socket.IO** for real-time client/server events
- **Redis** with **ioredis** for box persistence, pub/sub, and rate limiting
- **@socket.io/redis-adapter** for multi-instance WebSocket scaling
- **OpenID Connect** via `openid-client`
- **express-session** for browser session cookies
- **HTML, CSS, and Canvas API** frontend
- **pnpm** for package management
- **Docker** support with Redis included in the container

## Features Implemented

- Interactive canvas containing 1,000,000 boxes
- Authenticated-only box checking
- OpenID Connect login, callback, and logout support
- Session-protected REST and WebSocket routes
- Real-time box updates across all connected clients
- Redis persistence for checked box state
- Redis pub/sub adapter for Socket.IO scaling
- Per-user rate limiting for box checks
- Initial state hydration when a user connects
- Client-side modal prompt for unauthenticated users
- Graceful Redis and server shutdown on `SIGTERM`

## How to Run Locally

### 1. Install dependencies

```bash
pnpm install
```

### 2. Create your environment file

Copy the example file and add the required values:

```bash
cp .env.example .env
```

Then update `.env` with your Redis and OpenID Connect configuration.

### 3. Start Redis

If Redis is installed locally:

```bash
redis-server
```

Or run Redis with Docker:

```bash
docker run --name cbox-redis -p 6379:6379 redis:alpine
```

### 4. Start the app

For development:

```bash
pnpm dev
```

For production-style local run:

```bash
pnpm start
```

The app runs at:

```text
http://localhost:8000
```

unless `PORT` is set in `.env`.

## Environment Variables Required

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | No | Server port. Defaults to `8000`. |
| `REDIS_HOST` | No | Redis host. Defaults to `127.0.0.1`. |
| `REDIS_PORT` | No | Redis port. Defaults to `6379`. |
| `OIDC_ISSUER_URL` | Yes | OpenID Connect issuer URL. |
| `OIDC_CLIENT_ID` | Yes | OAuth/OIDC client ID. |
| `OIDC_CLIENT_SECRET` | Yes | OAuth/OIDC client secret. |
| `OIDC_REDIRECT_URI` | Yes | Callback URL registered with the identity provider. Example: `http://localhost:8000/auth/callback`. |
| `OIDC_POST_LOGOUT_REDIRECT_URI` | No | Redirect URL after logout. Defaults to `OIDC_REDIRECT_URI`. |
| `OIDC_SCOPE` | No | Requested scopes. Defaults to `openid profile email`. |
| `OIDC_ALLOW_INSECURE_HTTP` | No | Set to `true` only for local HTTP issuer testing. |
| `SESSION_SECRET` | Yes | Secret used to sign session cookies. |
| `NODE_ENV` | No | Set to `production` to enable secure cookies. |

Example:

```env
PORT=8000
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

OIDC_ISSUER_URL=https://your-issuer.example.com
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret
OIDC_REDIRECT_URI=http://localhost:8000/auth/callback
OIDC_POST_LOGOUT_REDIRECT_URI=http://localhost:8000
OIDC_SCOPE=openid profile email
SESSION_SECRET=replace-with-a-long-random-secret
NODE_ENV=development
```

## Redis Setup Instructions

The app uses three Redis clients:

- A default client for persistent box state and rate limiting
- A publisher client for Socket.IO Redis adapter events
- A subscriber client for Socket.IO Redis adapter events

Local Redis defaults:

```env
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

Box data is stored in the Redis hash:

```text
boxes_state
```

Each checked box is stored by box index. Unchecking a box deletes that index from the hash.

Rate limit counters are stored with keys like:

```text
rate_limit:checks:<userId>
```

These keys automatically expire after the configured rate limit window.

## Auth Flow Explanation

1. The frontend calls `GET /auth/me` to check whether the user already has a valid session.
2. If the user is not authenticated and tries to check a box, the UI opens a signup/login modal.
3. Clicking the signup button redirects the browser to `GET /auth/login`.
4. The server discovers the OIDC provider metadata, creates a PKCE code verifier, generates state, and redirects the user to the identity provider.
5. After login, the identity provider redirects back to `GET /auth/callback`.
6. The server exchanges the authorization code for tokens and stores the authenticated user details in the Express session.
7. The browser is redirected back to `/`.
8. Authenticated API routes and WebSocket connections read from the same session cookie.

The app stores only the session-side auth details needed for the user experience, including the user subject, name, email, token type, expiry, access token, and ID token.

## WebSocket Flow Explanation

1. The client loads `/auth/me`.
2. If authenticated, the client connects to Socket.IO with `io()`.
3. The Socket.IO engine uses the Express session middleware.
4. `requireSocketAuth` rejects unauthenticated WebSocket connections.
5. On connection, the server reads all checked boxes from the Redis `boxes_state` hash.
6. The server emits `initial_box_states` to the newly connected client.
7. When a user clicks a box, the client emits:

```js
socket.emit('box_clicked', { index, checked });
```

8. The server validates the payload, persists the change in Redis, and broadcasts the update to all connected clients:

```js
io.emit('box_clicked', { index, checked, name });
```

9. Other clients update their canvas state immediately.

## Rate Limiting Logic Explanation

The app limits how quickly a user can check boxes.

Current settings in `index.js`:

```js
const CHECK_LIMIT = 10;
const CHECK_LIMIT_WINDOW_SECONDS = 10;
```

When an authenticated user checks a box:

1. The server builds a Redis key using the OIDC subject, session ID, or socket ID.
2. Redis `INCR` increments the user-specific counter.
3. If this is the first check in the window, Redis `EXPIRE` sets the key to expire after 10 seconds.
4. If the counter is greater than 10, the server rejects the check and emits `rate_limited`.
5. The client removes the optimistic local check and redraws the grid.

Unchecking boxes is not rate limited.

## Screenshots or Demo Link

Add screenshots or a hosted demo link here before submitting the project.

```md
![App screenshot](./screenshots/app.png)

Demo: https://youtu.be/V4dsz5de3o0
```

## Docker

The included `Dockerfile` installs dependencies, starts Redis inside the container, and then starts the Node app with `start.sh`.

Build the image:

```bash
docker build -t c-box .
```

Run the container:

```bash
docker run --env-file .env -p 8000:8000 c-box
```

Make sure `PORT=8000` is set in `.env`, or adjust the published port to match your chosen app port.
