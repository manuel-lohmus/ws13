# ws13 history extension

## Purpose
- Small, fast in-memory history store usable for channels, admin replay and message history.

---

## Features
- Per-key circular buffers with configurable limit
- Global cap to prevent uncontrolled memory growth
- Append, list with time-range and filter, setLimit, clear, pruneOlderThan

---

## Usage

```js
const { createHistoryStore } = require('ws13/extensions/history');
const hs = createHistoryStore({ defaultLimit: 100, maxTotalItems: 10000 });

hs.append('channel:general', { user: 'alice', text: 'hello' });
const recent = hs.list('channel:general', { limit: 20, reverse: true });
```

**Notes**
 - In-memory and not persisted. For production, replace or wrap with a persistent store.
 - list supports a filter function and time ranges (since, until).

 
---

## Example: ws13/extensions/history/examples/history/server.js

```js
/**
 * history demo server
 * run: node server.js
 *
 * - stores messages per-channel using history extension
 * - supports a simple replay via message: { cmd: 'replay', channel }
 */

const http = require('http');
const createWebSocket = require('../../../core');
const { createHistoryStore } = require('../index');

const hs = createHistoryStore({ defaultLimit: 50, maxTotalItems: 1000 });

const server = http.createServer();
const { registry } = createWebSocket.attachServer(server, {
  onConnect(ws, req) {
    ws.on('message', (ev) => {
      let msg;
      try { msg = typeof ev === 'string' ? JSON.parse(ev) : ev; } catch (e) { return; }
      if (!msg) return;
      if (msg.cmd === 'publish' && msg.channel) {
        hs.append(msg.channel, { from: msg.from || 'anon', text: msg.text, ts: Date.now() });
        // echo to sender as ack
        ws.send(JSON.stringify({ status: 'ok', channel: msg.channel }));
      }
      else if (msg.cmd === 'replay' && msg.channel) {
        const items = hs.list(msg.channel, { limit: 50, reverse: false });
        ws.send(JSON.stringify({ cmd: 'replay', channel: msg.channel, items }));
      }
    });
  }
});

server.listen(8095, () => console.log('history demo running on ws://localhost:8095'));
```

## Example: ws13/extensions/history/examples/history/client.js

```js
/**
 * history demo client
 */
const http = require('http');
const createWebSocket = require('../../../core');

const req = http.request({ hostname: '127.0.0.1', port: 8095, path: '/' });
const ws = createWebSocket({ request: req });

ws.on('open', () => {
  // publish some messages
  ws.send(JSON.stringify({ cmd: 'publish', channel: 'general', text: 'hello 1', from: 'alice' }));
  ws.send(JSON.stringify({ cmd: 'publish', channel: 'general', text: 'hello 2', from: 'alice' }));

  // request replay
  ws.send(JSON.stringify({ cmd: 'replay', channel: 'general' }));
});

ws.on('message', (ev) => {
  try {
    const msg = typeof ev === 'string' ? JSON.parse(ev) : ev;
    if (msg.cmd === 'replay') {
      console.log('replay items:', msg.items);
      ws.close(1000, 'done');
    } else {
      console.log('msg', msg);
    }
  } catch (e) { console.error(e); }
});

ws.on('close', () => console.log('closed'));

```

---

## Persistent SQLite adapter (experimental)

### Install:

```bash
  npm install better-sqlite3
```

### Usage:

```js
  const { createSqliteHistory } = require('ws13/extensions/history/sqlite-adapter');
  const historyStore = createSqliteHistory(path.join(__dirname, 'data', 'history.db'), { defaultLimit: 100, maxTotalItems: 100000 });
  const channels = createChannelsManager({ historyLimit: 100, historyStore });
  const admin = createAdmin(registry, { historyStore, channelsManager: channels });
``` 