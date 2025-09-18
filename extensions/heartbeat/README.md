# ws13 heartbeat extension

## Purpose
- Provide a simple heartbeat (ping/pong) manager for ws13 WebSocket-like sockets.
- Measure round-trip latency and detect unresponsive peers.

---

## Install
- Copy ws13/extensions/heartbeat files into your project.

---

## API
- `createHeartbeatManager(opts)` -> `manager`
  - `opts.interval_ms` default interval for periodic pings
  - `opts.timeout_ms` default timeout to wait for pong

---

## Manager methods
- `attach(ws, opts)` — attach heartbeat to a ws. opts may include `interval_ms`, `timeout_ms`, `onTimeout`.
- `detach(ws)` — detach and cleanup listeners.
- `ping(ws, opts)` — send single ping; resolves to round-trip ms or false on timeout.
- `stopAll()` — placeholder to stop all (WeakMap prevents iteration; detach manually).

**Notes**
- The manager works with ws-like objects that implement `.send()` and emit 'pong' and 'close' events.
- For `ws13` core the extension integrates by calling `hb.attach(ws)` inside `onConnect`.

---

## Example: ws13/extensions/heartbeat/examples/heartbeat/server.js

```js
/**
 * Heartbeat demo server
 * Run: node server.js
 *
 * Server replies with 'pong' string when it receives 'ping' payload to simulate pong.
 */

const http = require('http');
const createWebSocket = require('../../../core');
const { createHeartbeatManager } = require('../index');

const hb = createHeartbeatManager({ interval_ms: 5000, timeout_ms: 2000 });

const server = http.createServer();
const { registry } = createWebSocket.attachServer(server, {
  onConnect(ws, req) {
    hb.attach(ws, {
      interval_ms: 2000,
      timeout_ms: 1000,
      onTimeout: (s) => {
        console.log('client timed out', s.ip || s._id || '(unknown)');
        try { s.close(4000, 'heartbeat timeout'); } catch (_) {}
      }
    });

    ws.on('message', (ev) => {
      // simple behavior: if 'ping' then reply 'pong'
      try {
        if (typeof ev === 'string' && ev === 'ping') ws.send('pong');
      } catch (_) {}
    });

    ws.on('close', () => {
      hb.detach(ws);
    });
  }
});

server.listen(8090, () => console.log('heartbeat demo server on ws://localhost:8090'));
```