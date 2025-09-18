# ws13 routing extension

Tiny routing layer for ws13 messages.

## Key concepts
 - Rules: list of match conditions and actions
 - Matchers: prefix, topic, meta fields, predicate functions
 - Actions: forward to channel, custom forward, drop, transform
 - Attach router to socket to auto-handle inbound messages

 ---

## Example

```js
const { createRouter } = require('ws13/extensions/routing');
const router = createRouter({
  rules: [
    { match: { prefix: 'audit:' }, action: { type: 'channel', channel: 'audit' } },
    { match: { prefix: 'upper:' }, action: { type: 'transform', fn: (payload) => ({ payload: payload.toUpperCase() }) } },
  ],
  onRoute: (info, ctx) => console.log('routed', info)
});
```

---

## Integration tips
 - Provide channelsManager via ctx when calling router.handle so it can forward to channels.
 - Use transform action to normalize messages (e.g., parse text into JSON) before forwarding.
 - Keep rules small and deterministic for performance.

 
---

## examples

### ws13/extensions/routing/examples/routing/server.js

```js
/**
 * Demo routing server
 *
 * - routes messages starting with "room:" into channel 'rooms'
 * - transforms messages starting with "upper:" and replies with transformed content
 */

const http = require('http');
const path = require('path');
const createWebSocket = require('../../../core');
const { createRouter } = require('../index');
const { createChannelsManager } = require('../../channels');

const mgr = createChannelsManager({ historyLimit: 50 });
mgr.createChannel('rooms');

const router = createRouter({
  rules: [
    { name: 'room-route', match: { prefix: 'room:' }, action: { type: 'channel', channel: 'rooms' } },
    {
      name: 'upper',
      match: { prefix: 'upper:' },
      action: {
        type: 'transform',
        fn: (payload) => {
          const s = String(payload);
          const rest = s.slice('upper:'.length);
          return { payload: rest.toUpperCase() };
        }
      }
    },
    {
      name: 'upper-reply',
      match: { prefix: 'upper:' },
      action: { type: 'forward', to: (payload, meta, ctx) => {
        try { ctx.ws.send(JSON.stringify({ upper: payload })); } catch (_) {}
      } }
    }
  ],
  onRoute: (info, ctx) => console.log('routed:', info)
});

const server = http.createServer();
const { registry } = createWebSocket.attachServer(server, {
  onConnect(ws, req) {
    // attach router auto-handling (provide channelsManager to forward)
    router.attachToSocket(ws, { channelsManager: mgr });

    // join rooms channel automatically for demo
    const c = mgr.getChannel('rooms');
    c.add(ws);

    ws.on('message', (ev) => {
      // router.attachToSocket already handles messages; this is just for logging
      console.log('incoming', ev.data || ev);
    });

    ws.on('close', () => { c.remove(ws); });
  }
});

server.listen(8098, () => console.log('routing demo on ws://localhost:8098'));
```

### ws13/extensions/routing/examples/routing/client.js

```js
/**
 * Demo routing client
 */
const http = require('http');
const createWebSocket = require('../../../core');

const req = http.request({ hostname: '127.0.0.1', port: 8098, path: '/' });
const ws = createWebSocket({ request: req });

ws.on('open', () => {
  // route to channel
  ws.send('room:hello from client');

  // transform & reply
  ws.send('upper:please shout');
});

ws.on('message', (ev) => {
  console.log('msg', ev.data || ev);
});
```