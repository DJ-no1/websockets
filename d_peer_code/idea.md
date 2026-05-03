# 🪞 PeerCode 

> **Two developers. One frontend problem. Zero accounts needed.**  
> A lightweight, side-by-side live coding arena where you can challenge friends or random developers to practical frontend challenges (like building a stateful DOM counter).

## 📖 The Concept
Unlike traditional algorithmic battlegrounds, **PeerCode** focuses on practical UI/DOM challenges. Two users join a room, read the same problem statement, and code in their own separate editors. You don't code *together*—but you can see each other's live code and UI preview side-by-side in real-time.

It’s perfect for casual coding sprints, peer mentoring, or mock technical interviews.

## ✨ Core Features
*   ⚔️ **Instant Matchmaking:** No accounts or sign-ups. Click "Find Match" to be paired with a random user in the queue (Clash of Clans style), or generate a custom URL to invite a friend.
*   💻 **Side-by-Side Editors:** Your code is on the left; your opponent's (read-only) code is on the right. Both update in real-time.
*   ⚡ **Live Iframe Previews:** No complex backend code execution. Code is rendered locally in the browser via `<iframe>`, giving instant visual feedback for HTML/JS challenges.
*   🆘 **"I'm Stuck!" Ping:** Hit a wall? Click the "I'm Stuck" button. It grabs your exact cursor position and flashes a red highlight on your opponent's screen, so they know exactly where you need help.
*   💬 **Integrated Chat:** A simple real-time chat box to communicate, taunt, or help your opponent.
*   ⏱️ **Synchronized 1-Hour Timer & Tests:** Challenges give users exactly 1 hour. Custom test suites (hidden injected scripts) run against the iframe DOM to auto-validate practical coding tasks.
*   🔄 **Accidental Refresh Recovery:** Because the timer, code, and chat states are constantly synced to a Redis hash mapping, closing a tab or refreshing won't destroy an active session (until the 1-hour Redis TTL expires).

---

## 🖥️ The UI Layout
The workspace is cleanly divided in half:
*   **Top Bar:** Problem Statement | Shared 1-Hour Timer | Matchmaking URL
*   **Left Half (You):** CodeMirror Editor (Top) + Your Live Web Preview (Bottom)
*   **Right Half (Them):** Opponent's Code (Top, Read-Only) + Their Live Web Preview (Bottom)
*   **Bottom Corner:** Real-time Chat & the "I'm Stuck" button.

---

## 🛠️ Tech Stack & Implementation Plan

This project is intricately designed to be fast, multi-server scalable, and resilient to disconnects using a high-performance ephemeral memory layer (Redis) rather than a persistent database.

**Frontend:**
*   **React (Vite)** - Fast frontend rendering.
*   **Tailwind CSS** - Rapid UI styling.
*   **@uiw/react-codemirror** - Lightweight code editor.
*   **socket.io-client** - Live WebSocket communication.

**Backend:**
*   **Node.js & Express** - Simple server.
*   **Socket.io** - The backbone of the app. Handles matchmaking queues, chat, syncing code strings, and cursor pings.
*   **Redis (ioredis & @socket.io/redis-adapter)** - Essential ephemeral state management. Used for multi-server Socket Pub/Sub scaling, 1-hour session timers (using Redis Keys TTL), matchmaking queues, and persisting live code payloads across accidental browser refreshes.
*   **pnpm** - Lightning-fast package manager.

---

## 🏗️ Architecture & Redis Architecture Flow

1. **Phase 1: Infrastructure & Redis Configuration**
   - Initialize Node.js Express + Socket.IO backend.
   - Attach `@socket.io/redis-adapter` for multi-server horizontal scaling.
   - Configure connected standard Redis client (via `ioredis`) for state management.
   - Define baseline Redis Key schema:
     - `queue:matchmaking` (List for finding matches)
     - `room:<id>:state` (Hash storing code, users, start time)
     - `room:<id>:chat` (List storing chat messages)

2. **Phase 2: Matchmaking & Custom Challenges**
   - Implement `find_match` socket event. Users push to a Redis List (`RPUSH queue:matchmaking <socket_id>`).
   - A worker/listener pops pairs from the queue, creates a unique `room:<id>`, provisions the initial Redis Hash for room state (timer, user A, user B).
   - Inject the specific problem statement and its test suite (provided by the admin) into the room state.
   - Set Redis TTL on the room keys to exactly 1 hour (`EXPIRE room:<id>:state 3600`). This matches the game bounds exactly.

3. **Phase 3: Code Sync & Reconnection Backbone**
   - Client sends debounced `code_update` wrapper events.
   - Server handles `code_update`: Updates `HSET room:<id>:state user:<id>_code "<new_code>"` and broadcasts `peer_code_update` to the opponent.
   - **Accidental Refresh Handling:** On socket reconnect, if the client presents an active `roomId` and `userID` (stored in their `localStorage`), fetch `HGETALL room:<id>:state`. 
   - Fulfill a restore payload, sending latest code + the remaining room TTL.

4. **Phase 4: Volatile Interactions (Chat & Pings)**
   - "I'm Stuck" cursor pings are purely transient Socket emissions (no DB sync needed; just pass to room).
   - **Chat System:** Emitted messages are pushed to a Redis list (`RPUSH room:<id>:chat` with `LTRIM room:<id>:chat -50 -1` to keep the last 50 messages) and broadcast.

5. **Phase 5: Automated Testing & Win State**
   - The user-provided challenge payload includes a validation script.
   - Inject this script secretly to the user's client iframe `srcDoc`.
   - On `window.parent.postMessage({ type: 'TEST_PASS' })` success from the iframe, the React app emits `challenge_complete`.
   - Server updates Redis room state, announces winner, and stops the room timer.

---

## 🚀 Getting Started (Using pnpm)

### 1. Set up the Backend (Socket Server)
```bash
mkdir server client
cd server
pnpm init
pnpm add express socket.io ioredis @socket.io/redis-adapter cors dotenv
```
*The server will start on `http://localhost:3001`.*

### 2. Set up the Frontend (Client)
Open a new terminal window:
```bash
cd ../client
pnpm create vite . --template react
pnpm install
pnpm add socket.io-client @uiw/react-codemirror @codemirror/lang-javascript tailwindcss @tailwindcss/vite
```
*The client will start on `http://localhost:5173`.*

---

## 🗺️ Roadmap & Future Scope
- [ ] Add support for CSS in a separate editor tab.
- [ ] Add sound effects for chat messages, passing tests, and the "I'm Stuck" ping.
- [ ] Implement "Spectator Mode" where a 3rd person can watch the 1v1 match.

---

### 🤝 Contributing
Feel free to fork the project, open a pull request, or submit an issue if you have ideas to make this sandbox even better!

**License:** MIT
   - A worker/listener pops pairs from the queue, creates a unique `room:<id>`, provisions the initial Redis Hash for room state (timer, user A, user B).
   - Inject the specific problem statement and its test suite (provided by the admin) into the room state.
   - Set Redis TTL on the room keys to exactly 1 hour (`EXPIRE room:<id>:state 3600`). This matches the game bounds exactly.

3. **Phase 3: Code Sync & Reconnection Backbone**
   - Client sends debounced `code_update` wrapper events.
   - Server handles `code_update`: Updates `HSET room:<id>:state user:<id>_code "<new_code>"` and broadcasts `peer_code_update` to the opponent.
   - **Accidental Refresh Handling:** On socket reconnect, if the client presents an active `roomId` and `userID` (stored in their `localStorage`), fetch `HGETALL room:<id>:state`. 
   - Fulfill a restore payload, sending latest code + the remaining room TTL.

4. **Phase 4: Volatile Interactions (Chat & Pings)**
   - "I'm Stuck" cursor pings are purely transient Socket emissions (no DB sync needed; just pass to room).
   - **Chat System:** Emitted messages are pushed to a Redis list (`RPUSH room:<id>:chat` with `LTRIM room:<id>:chat -50 -1` to keep the last 50 messages) and broadcast.

5. **Phase 5: Automated Testing & Win State**
   - The user-provided challenge payload includes a validation script.
   - Inject this script secretly to the user's client iframe `srcDoc`.
   - On `window.parent.postMessage({ type: 'TEST_PASS' })` success from the iframe, the React app emits `challenge_complete`.
   - Server updates Redis room state, announces winner, and stops the room timer.

---

## 🚀 Getting Started (Using pnpm)

### 1. Set up the Backend (Socket Server)
```bash
mkdir server client
cd server
pnpm init
pnpm add express socket.io ioredis @socket.io/redis-adapter cors dotenv
```
*The server will start on `http://localhost:3001`.*

### 2. Set up the Frontend (Client)
Open a new terminal window:
```bash
cd ../client
pnpm create vite . --template react
pnpm install
pnpm add socket.io-client @uiw/react-codemirror @codemirror/lang-javascript tailwindcss @tailwindcss/vite
```
*The client will start on `http://localhost:5173`.*

---

## 🗺️ Roadmap & Future Scope
- [ ] Add support for CSS in a separate editor tab.
- [ ] Add sound effects for chat messages, passing tests, and the "I'm Stuck" ping.
- [ ] Implement "Spectator Mode" where a 3rd person can watch the 1v1 match.

---

### 🤝 Contributing
Feel free to fork the project, open a pull request, or submit an issue if you have ideas to make this sandbox even better!

**License:** MIT
