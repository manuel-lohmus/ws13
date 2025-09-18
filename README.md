<p id="ws13-logo">
  <img src="logo/logo-ws13.png" alt="ws13 logo" width="200">
</p>


# ws13 — WebSocket API v1.1.0

Modular, extensible and operations-friendly WebSocket framework for Node.js. This release focuses on a small, stable core so dependent projects can proceed; extensions ([`channels`](./extensions/channels/README.md), [`auth`](./extensions/auth/README.md), [`history`](./extensions/history/README.md), [`events`](./extensions/events/README.md), [`admin`](./extensions/admin/README.md), [`routing`](./extensions/routing/README.md), [`heartbeat`](./extensions/heartbeat/README.md), [`message-meta`](./extensions/message-meta/README.md), `permessage-deflate`) exist as planned work and will be completed and documented in follow-up releases.

Status: core stable and testable — extensions work in progress (APIs present in repository; integration examples available in examples/).

## 📚 Table of Contents

- [✨ Highlights](#-highlights-v110)
- [📦 Installation](#-installation)
- [🚀 Quick start](#-quick-start--minimal-server)
- [🧩 Core API](#-core-api-summary)
- [🧪 Tests](#-tests)
- [🧩 Extension roadmap](#-extension-roadmap-short)
- [🛠 Operational notes](#-operational-notes)
- [📁 Project Structure](#-project-structure)
- [📜 License - MIT](#-license)

---

## ✨ Highlights (v1.1.0)

 - Small, well-tested core for WebSocket handshake, frame parsing/serialisation and basic client/server modes.
 - `createRegistry()` — lightweight connection registry with broadcast and auto-clean.
 - `attachServer(server, opts)` — simple HTTP upgrade wiring.
 - Built-in support for `permessage-deflate` (RFC 7692) provided as an optional extension instance.
 - Client-side reconnect helpers (configurable) and heartbeat primitives in core.
 - TypeScript definitions included ('index.d.ts') for IDE support.
 - Tests included for core registry and basic behaviour (see 'index.test.js').

Extensions ([`channels`](./extensions/channels/README.md), [`events`](./extensions/events/README.md), [`history`](./extensions/history/README.md), [`admin`](./extensions/admin/README.md), [`routing`](./extensions/routing/README.md), [`message-meta`](./extensions/message-meta/README.md), [`heartbeat`](./extensions/heartbeat/README.md)) are available as separate modules in the repo but marked WIP — README below points to that.

<p align="right"><a href="#ws13-logo">Back to top ↑</a></p>

---

## 📦 Installation

npm:

```bash
npm install ws13
```

yarn:

```bash
yarn add ws13
```

<p align="right"><a href="#ws13-logo">Back to top ↑</a></p>

---

## 🚀 Quick start — minimal server

This example uses the core createWebSocket exported from the package.

```js
const http = require('http');
const createWebSocket = require('ws13');

const server = http.createServer();

const { registry } = createWebSocket.attachServer(server, {
  onConnect(ws, req) {
    ws.send('Welcome');
    ws.on('message', (evt) => {
      // simple echo
      ws.send(`Echo: ${evt.data}`);
    });
  }
});

server.listen(8080);
```

Client (Node.js reusing createWebSocket in client mode):

```js
const http = require('http');
const createWebSocket = require('ws13');

const req = http.request({ host: '127.0.0.1', port: 8080, path: '/' });
const ws = createWebSocket({ request: req });

ws.on('open', () => ws.send('hello'));
ws.on('message', (evt) => console.log(evt.data));
```

Browser clients should use the native WebSocket API (wss:// for TLS).

<p align="right"><a href="#ws13-logo">Back to top ↑</a></p>

---

## 🧩 Core API (summary)

 - `createWebSocket(options)`: create client or server WebSocket-like instance
  - options highlights: `request` (IncomingMessage | ClientRequest), `socket`, `protocol`, `origin`, `heartbeatInterval_ms`, `extension` (or null), `autoReconnect`, `requestFactory`, `shouldReconnect`, `isDebug`.
  - returned object is EventEmitter-like and supports: `send(data)`, `sendPing(data)`, `sendPong(data)`, `heartbeat(cb)`, `close(code, reason)`. Properties: `readyState`, `ip`, `port`, `latency_ms`, `bufferedAmount`, `protocol`, `extensions`, `url`.
- `createRegistry()`: returns `{ add(ws), delete(ws), broadcast(data), size(), clients:Set }`
 - `registry` auto-cleans clients on `close`/`error`.
- `attachServer(server, { registry?, onConnect? })`: attaches upgrade handler and returns `{ registry }`.
- Default `permessage-deflate` extension is provided in core (createPermessageDeflate) and can be disabled via `createWebSocket({ extension: null })`.

TypeScript definitions are available at 'index.d.ts' for full shapes and options.

<p align="right"><a href="#ws13-logo">Back to top ↑</a></p>

---

## 🧪 Tests

Project ships basic tests for the core. Use test-runner-lite (or Node directly) to run tests.

Run all tests:

```bash
npm test
```

Run the core test directly:

```bash
node ./index.test.js
```

Example core tests included:
 - registry add/delete and automatic cleanup on close/error
 - attachServer integration behaviour
 - basic createWebSocket attachment helpers

Add more tests as needed; tests live next to core and in each extension folder when implemented.

<p align="right"><a href="#ws13-logo">Back to top ↑</a></p>

---

## 🧩 Extension roadmap (short)

The following extensions exist as separate modules and will be fully documented and stabilised in subsequent releases. 
Current status: prototype/partial implementations present in repo.

 - [`channels`](./extensions/channels/README.md) — channel-based pub/sub
 - [`message-meta`](./extensions/message-meta/README.md) — typed messages with meta (wrap/unwrap)
 - [`heartbeat`](./extensions/heartbeat/README.md) — idle/timeout hooks and monitor
 - [`history`](./extensions/history/README.md) — per-channel replay buffer (last N messages)
 - [`events`](./extensions/events/README.md) — JSON-RPC style event emitter (ws.onEvent / ws.emitEvent)
 - [`admin`](./extensions/admin/README.md) — HTTP + WebSocket admin API, CSV/JSON export, disconnect/latency endpoints, live dashboard
 - [`routing`](./extensions/routing/README.md) — targeted delivery (sendToUser, sendToRole, sendToIp)
 - [`auth`](./extensions/auth/README.md) — authentication and role-based authorization

 If your project relies on a specific extension, tell me which one and I will prioritise finishing it and publishing a stable interface.

<p align="right"><a href="#ws13-logo">Back to top ↑</a></p>

---

## 🛠 Operational notes

 - Default `heartbeatInterval_ms` in core is 30s (can be changed per socket).
 - When enabling compression, configure `maxDecompressSize` to protect against decompression attacks.
 - Registry clients are a Set; if you need ordered lists or sharding, wrap registry accordingly.
 - The core focuses on correctness of handshake and frame handling — if you need production tuning (backpressure handling, batching or socket pooling) we can add recommended patterns.

<p align="right"><a href="#ws13-logo">Back to top ↑</a></p>

---

## 📁 Project Structure

```
ws13/
    core/
        index.d.ts
        index.js
        index.test.js
        permessage-deflate.js
        README.md
    extensions/
        admin/
            index.d.ts
            index.js
            index.test.js
            README.md
            express-middleware.d.ts
            express-middleware.js
            examples/
                admin-api/
                    server.js
                admin-dashboard/
                    admin-dashboard.html
                admin-express-integration/
                    index.js
                    README.md
        auth/
            index.d.ts
            index.js
            index.test.js
            README.md
            examples/
                auth-channels-client.js
                auth-channels-server.js
                server-with-admin.js
        channels/
            index.d.ts
            index.js
            index.test.js
            README.md
            examples/
                channels/
                    client.js
                    server.js
        events/
            index.d.ts
            index.js
            index.test.js
            README.md
            examples/
                events/
                    client.js
                    server.js
        heartbeat/
            index.d.ts
            index.js
            index.test.js
            README.md
            examples/
                heartbeat/
                    client.js
        history/
            index.d.ts
            index.js
            index.test.js
            README.md
            sqlite-adapter.js
            sqlite-adapter.test.js
            examples/
                history/
                    client.js
                    server.js
        message-meta/
            index.d.ts
            index.js
            index.test.js
            README.md
            examples/
                message-meta/
                    client.js
                    server.js
                    routing-server.js
        routing/
            index.d.ts
            index.js
            index.test.js
            README.md
            examples/
                routing/
                    client.js
                    server.js
    logo/
        logo-ws13.png
    browser.js
    index.d.ts
    index.js
    LICENSE
    package.json
    README.md
    testRunner.js
    wrapper.mjs
```

<p align="right"><a href="#ws13-logo">Back to top ↑</a></p>

---

## 📌 Contributing & development

 - If you need only the core to unblock dependent projects, use the provided core export and tests. Extensions will follow; they are useful but not required for core adoption.
 - Tell me which extension to stabilise first ([`channels`](./extensions/channels/README.md), [`history`](./extensions/history/README.md), [`events`](./extensions/events/README.md), [`auth`](./extensions/auth/README.md), [`admin`](./extensions/admin/README.md) or [`routing`](./extensions/routing/README.md)) and I’ll prepare stable API docs, tests, and examples.

<p align="right"><a href="#ws13-logo">Back to top ↑</a></p>

---

## 📜 License

This project is licensed under the MIT License.<br>
Copyright &copy; Manuel Lõhmus

<p align="right"><a href="#ws13-logo">Back to top ↑</a></p>

---