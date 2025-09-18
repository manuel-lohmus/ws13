# ws13 core module

This is the core module of the `ws13` WebSocket framework. It provides the foundational primitives for building extensible, event-driven WebSocket servers.

## Features

- `attachServer(server, options)` – attach ws13 to an HTTP server
- `attachWebSocket(ws, meta)` – initialize a WebSocket-like instance
- `createRegistry()` – track active connections
- `createWebSocket(options)` – client-side connector

## Usage

```js
const http = require('http');
const createWebSocket = require('ws13');

const server = http.createServer();
const { registry } = createWebSocket.attachServer(server, {
  onConnect(ws, req) {
    ws.send('Welcome!');
    ws.on('message', (evt) => {
      ws.send(`Echo: ${evt.data}`);
    });
  }
});

server.listen(8080);
```

---

## Registry

The registry tracks all active WebSocket connections:

```js
const registry = createRegistry();
registry.add(ws);
registry.remove(ws);
for (const client of registry.clients) {
  client.send('Broadcast');
}
```

---

## Extensibility

You can extend ws13 with modular plugins:
 - [`auth`](../extensions/auth/README.html) – authentication and authorization
 - [`channels`](../extensions/channels/README.html) – channel-based messaging
 - [`message-meta`](../extensions/message-meta/README.html) – typed messages with metadata
 - [`heartbeat`](../extensions/heartbeat/README.html) – idle and timeout detection
 - [`events`](../extensions/events/README.html) – JSON-RPC style event emitter
 - [`history`](../extensions/history/README.html) – message replay for new joiners
 - [`admin`](../extensions/admin/README.html) – live monitoring and export
 - [`routing`](../extensions/routing/README.html) – targeted delivery by user/role/IP
 
Each extension is fully decoupled and can be composed as needed.

---

## License

This project is licensed under the MIT License.

Copyright &copy; Manuel Lõhmus

---