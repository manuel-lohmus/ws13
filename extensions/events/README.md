# ws13 events extension

Tiny JSON-event API for ws13 WebSocket-like sockets.

## API
- `createEventAPI()` -> `{ attach(ws), on(name, fn), off(name, fn) }`
- `ws.onEvent(name, fn)` -> `register` per-socket handler
- `ws.emitEvent(name, data, meta?)` -> send JSON `{ event, data, meta }`

---

## Features
- Per-socket handlers and global handlers via manager.on
- Simple wildcard support: "chat:*" matches "chat:msg"
- Lightweight and transport-agnostic (serialises to JSON string frames)

---

## Usage
- Attach the event API to sockets on connect:
  const evt = createEventAPI();
  evt.attach(ws);

- Register handler per-socket:
  ws.onEvent('chat:msg', (data, meta) => { ... });

- Emit event:
  ws.emitEvent('chat:msg', { text: 'hello' });

**Notes**
- The extension expects event frames to be JSON strings shaped as { event: string, data: any, meta?: any }.
- If your core already parses messages into objects, you may adapt the attach inbound handler to accept different shapes.


## examples

### ws13/extensions/events/examples/events/server.js

```js
/**
 * Minimal server demonstrating events extension
 */
const http = require('http');
const createWebSocket = require('../../../core');
const { createEventAPI } = require('../index');

const server = http.createServer();
const evtManager = createEventAPI();

const { registry } = createWebSocket.attachServer(server, {
  onConnect(ws, req) {
    evtManager.attach(ws);

    // per-connection handler
    ws.onEvent('join', (data) => {
      console.log('user joined', data.user);
      // broadcast to this socket only as demo
      ws.emitEvent('joined:ack', { ok: true, user: data.user });
    });
  }
});

server.listen(8084, () => console.log('events demo server listening on ws://localhost:8084'));

```

### ws13/extensions/events/examples/events/client.js

```js
/**
 * Minimal client demonstrating events extension
 */
const http = require('http');
const createWebSocket = require('../../../core');
const { createEventAPI } = require('../index');

const req = http.request({ hostname: '127.0.0.1', port: 8084, path: '/' });
const ws = createWebSocket({ request: req });

ws.on('open', () => {
  const evt = createEventAPI();
  evt.attach(ws);

  ws.onEvent('joined:ack', (data) => {
    console.log('joined acknowledged', data);
    ws.close(1000, 'bye');
  });

  ws.emitEvent('join', { user: 'alice' });
});

ws.on('error', console.error);
ws.on('close', () => console.log('closed'));
```