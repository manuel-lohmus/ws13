# ws13 channels extension

Lightweight channel-based pub/sub layer for ws13.

## Features
- `createChannel(name)`: per-channel membership management
- join/leave via `channel.add(ws)` / `channel.remove(ws)`
- `channel.broadcast(payload, opts)` and `channel.publish(ws, payload)` with permission hooks
- `optional` per-channel history (last N messages) and `replayTo(ws)`
- `permissionChecker` with `canJoin(ws, channelName)` and `canPublish(ws, channelName, payload)`

---

## Usage

```js
const { createChannelsManager } = require('ws13/extensions/channels');
const mgr = createChannelsManager({ historyLimit: 50, permissionChecker });

const chat = mgr.createChannel('chat');
chat.add(ws);            // join
chat.broadcast({text:'hi'});
chat.replayTo(ws);       // send last messages to newly joined ws
```

**Notes**
 - `channel.broadcast` serializes messages as JSON `{ channel, payload, meta, timestamp }` to each member using `ws.send..`
 - For production use ensure send backpressure and closed socket handling are properly managed by your ws-like objects.


---

## examples

### ws13/extensions/channels/examples/channels/server.js

```js
/**
 * Demo server using channels extension and auth integration
 *
 * Run: node server.js
 */

const http = require('http');
const createWebSocket = require('../../../core');
const { createChannelsManager } = require('../index');
const { createAuth, defaultVerifier } = require('../../auth');

const tokens = { 'alice-token': { user: 'alice', roles: ['admin'] }, 'bob-token': { user: 'bob', roles: ['user'] } };
const auth = createAuth({ verifier: defaultVerifier(tokens) });

const server = http.createServer();
const { registry } = createWebSocket.attachServer(server, {
  onConnect(ws, req) {
    // authenticate during onConnect (token in query)
    auth.wsAuthenticate(ws, req).then(ok => {
      if (!ok) { ws.close(4001, 'unauthorized'); return; }
      // auto join general channel
      const mgr = global.__channels_mgr || (global.__channels_mgr = createChannelsManager({ historyLimit: 20 }));
      const chat = mgr.createChannel('general');
      chat.add(ws);
      ws.on('message', (ev) => {
        // expect JSON messages with { channel, payload }
        let obj;
        try { obj = JSON.parse(ev.data); } catch (e) { return; }
        if (obj && obj.channel && obj.payload) {
          const ch = mgr.getChannel(obj.channel);
          if (ch) ch.publish(ws, obj.payload);
        }
      });
    }).catch(err => ws.close(4001, 'unauthorized'));
  }
});

server.listen(8083, () => console.log('channels demo listening on ws://localhost:8083 (try ?token=alice-token)'));
```

### ws13/extensions/channels/examples/channels/client.js

```js
/**
 * Demo client that joins channel and sends messages
 */
const http = require('http');
const createWebSocket = require('../../../core');

const token = 'alice-token'; // or bob-token
const req = http.request({ hostname: '127.0.0.1', port: 8083, path: '/?token=' + encodeURIComponent(token) });
const ws = createWebSocket({ request: req });

ws.on('open', () => {
    console.log('open');
    // send a channel publish message
    ws.send(JSON.stringify({ channel: 'general', payload: { text: 'hello from client' } }));
});

ws.on('message', (ev) => {
    try {
        const obj = JSON.parse(ev.data);
        console.log('chan msg', obj);
    } catch (e) { console.log('raw', ev.data); }
});

ws.on('close', () => console.log('closed'));
ws.on('error', console.error);
```

