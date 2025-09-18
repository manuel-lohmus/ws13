# ws13 message-meta extension

## Purpose
 - Add metadata to outgoing messages (id, timestamp, sender, seq) and parse incoming metadata.
 - Useful for history recording, audit, de-duplication and tracing.

---

## Features
 - Per-connection sequence numbers
 - Pluggable ID generator and signing/validation hooks
 - Helpers to attach to channels so published messages are wrapped automatically

---

## Usage

```js
const { createMessageMeta } = require('ws13/extensions/message-meta');
const mm = createMessageMeta({ perConnectionSequence: true });

server.on('upgrade', (req, socket) => {
  const ws = createWebSocket({ request: req });
  mm.attach(ws);
  // send:
  const r = await mm.wrapOutgoing(ws, { text: 'hello' });
  ws.send(r.frame);
});

// parsing incoming:
ws.on('message', (ev) => {
  const parsed = mm.parseIncoming(ev.data || ev);
  if (parsed.ok) {
    console.log('meta', parsed.meta, 'payload', parsed.payload);
  }
});
```

---

## Integration
 - Use together with history adapter and channels to persist full messages with meta.
 - Use admin export endpoints to include meta in CSV/JSON exports.

---

 ## Custom signing/validation
 - Provide signOutgoing(meta, payload) to append signatures to meta before sending.
 - Provide validateIncoming(meta) to reject messages with missing/invalid meta.


---

## ws13/extensions/message-meta/examples/message-meta/server.js

```js
/**
 * Demo server for message-meta
 *
 * Run: node server.js
 *
 * - attaches message-meta to sockets and echoes messages with meta
 */

const http = require('http');
const createWebSocket = require('../../../core');
const { createMessageMeta } = require('../index');

const mm = createMessageMeta({ perConnectionSequence: true });

const server = http.createServer();
const { registry } = createWebSocket.attachServer(server, {
  onConnect(ws, req) {
    mm.attach(ws);
    ws.on('message', (ev) => {
      const parsed = mm.parseIncoming(ev.data || ev);
      if (parsed.ok) {
        // echo back with same meta
        const frame = JSON.stringify({ echo: parsed.payload, __meta: parsed.meta });
        ws.send(frame);
      } else {
        ws.send(JSON.stringify({ error: parsed.reason || 'bad' }));
      }
    });
  }
});

server.listen(8096, () => console.log('message-meta demo on ws://localhost:8096'));
```

---

## ws13/extensions/message-meta/examples/message-meta/client.js

```js
/**
 * Demo client for message-meta
 */
const http = require('http');
const createWebSocket = require('../../../core');
const { createMessageMeta } = require('../index');

const mm = createMessageMeta({ perConnectionSequence: true });

const req = http.request({ hostname: '127.0.0.1', port: 8096, path: '/' });
const ws = createWebSocket({ request: req });

ws.on('open', async () => {
  mm.attach(ws);
  const { frame } = await mm.wrapOutgoing(ws, { hello: 'world' });
  ws.send(frame);
});

ws.on('message', (ev) => {
  const parsed = mm.parseIncoming(ev.data || ev);
  console.log('server replied', parsed);
  ws.close(1000, 'done');
});

ws.on('error', console.error);
ws.on('close', () => console.log('closed'));
```