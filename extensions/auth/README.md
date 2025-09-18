# ws13 auth extension

## Purpose
- Simple token-based authentication helpers for ws13
- Attach auth metadata to ws.auth for downstream extensions (admin, channels, routing)

---

## API summary

- `createAuth(options)` -> `{ verifyToken, wsAuthenticate, httpMiddleware, requireRole, defaultVerifier }`

Options
- `verifier`: async function(token) => { ok, user, roles, meta } — by default built from a tokens map
- `roleAccessor`: function(result) => roles[]
- `tokenSources`: ['query','header'] (where to read tokens from)
- `headerName`: header key for token (default 'x-auth-token')

---

## Examples

1) Server-side attachServer usage:

```js
const { createAuth } = require('ws13/extensions/auth');
const auth = createAuth({ verifier: myVerifier });

server.on('upgrade', (request, socket, head) => {
  const ws = createWebSocket({ request });
  if (!ws) { request.socket.end(); return; }

  // inside onConnect or immediately after createWebSocket (server-side)
  auth.wsAuthenticate(ws, request).then(ok => {
    if (!ok) return ws.close(4001, 'unauthorized');
    // ws.auth is now available: ws.auth.user, ws.auth.roles
  });
});
```

2) Protect HTTP endpoints with middleware:

```js
const app = express();
const auth = createAuth({ verifier: myVerifier });
app.use('/protected', auth.httpMiddleware(), (req, res) => { res.send('ok'); });
```

**Notes**

 - The extension deliberately keeps auth logic pluggable — use your own verifier to integrate JWT, DB, OAuth or external services.
 - After successful wsAuthenticate, ws.auth = { user, roles, meta }.


 
---

## examples

### auth-channels-server.js

```js
// minimal example: start server and accept ws with token query
const http = require('http');
const createWebSocket = require('../../../core');
const { createAuth, defaultVerifier } = require('../index');

const tokens = { 'alice-token': { user: 'alice', roles: ['admin'] }, 'bob-token': { user: 'bob', roles: ['user'] } };
const auth = createAuth({ verifier: defaultVerifier(tokens) });

const server = http.createServer();
const { registry } = createWebSocket.attachServer(server, {
  onConnect: (ws, req) => {
    auth.wsAuthenticate(ws, req).then(ok => {
      if (!ok) { ws.close(4001, 'unauthorized'); return; }
      console.log('connected', ws.auth.user, ws.auth.roles);
      ws.send(`welcome ${ws.auth.user}`);
      ws.on('message', ev => {
        ws.send(`[${ws.auth.user}] ${ev.data}`);
      });
    }).catch(err => {
      ws.close(4001, 'unauthorized');
    });
  }
});

server.listen(8081, () => console.log('auth demo server running on http://localhost:8081/?token=alice-token'));
```

### auth-channels-client.js

```js 
// client connecting with token in query string
const http = require('http');
const createWebSocket = require('../../../core');

const token = 'alice-token';
const req = http.request({ hostname: '127.0.0.1', port: 8081, path: '/?token=' + encodeURIComponent(token) });
const ws = createWebSocket({ request: req });

ws.on('open', () => {
  console.log('open');
  ws.send('hello from client');
});
ws.on('message', (ev) => {
  console.log('msg', ev.data);
});
ws.on('close', () => console.log('closed'));
ws.on('error', console.error);
```

### Example: integrate auth + admin registerListener RBAC

```js
/**
 * Demo: attachAuthToServer + admin.registerListener RBAC demo
 *
 * - attaches ws13 to server
 * - uses createAuth with token map
 * - admin requires role 'admin' (via requireRole)
 * - dashboard connects to /admin-socket and admin.registerListener enforces RBAC
 */

const http = require('http');
const createWebSocket = require('../../../core');
const { createAdmin } = require('../../admin');
const { createAuth, defaultVerifier, attachAuthToServer } = require('../index');
const fs = require('fs');

const tokens = {
  'alice-token': { user: 'alice', roles: ['admin'] },
  'bob-token': { user: 'bob', roles: ['user'] }
};
const auth = createAuth({ verifier: defaultVerifier(tokens) });

const server = http.createServer((req, res) => {
  if (req.url === '/admin') {
    res.setHeader('content-type', 'text/html');
    res.end(fs.readFileSync(__dirname + '/admin-dashboard.html', 'utf8'));
    return;
  }
  res.end('ok');
});

// create core attachServer manually to get registry
const { registry } = createWebSocket.attachServer(server, {
  onConnect(ws, req) {
    // intentionally noop — we will authenticate via attachAuthToServer wrapper instead
  }
});
// remove default upgrade and reattach via attachAuthToServer
server.removeAllListeners('upgrade');

const admin = createAdmin(registry, { requireRole: 'admin' });

// Use attachAuthToServer to authenticate incoming ws and add to registry
attachAuthToServer(server, auth, {
  createWebSocket,
  registry,
  onConnect: (ws, req) => {
    // this will be called only for authenticated clients; ws.auth available
    console.log('authenticated connect', ws.auth.user);
  },
  onAuthFailed: (req, socket) => { try { socket.destroy(); } catch(_){} }
});

// Admin WebSocket upgrade for dashboard (attempt to register listener)
server.on('upgrade', (req, socket, head) => {
  if (req.url && req.url.startsWith('/admin-socket')) {
    const ws = createWebSocket({ request: req });
    // try register; registerListener will check roles from ws.auth (or via authorize hook)
    admin.registerListener(ws).then(unreg => {
      console.log('admin dashboard connected');
      ws.on('close', () => unreg());
    }).catch(err => {
      try { ws.close(4003, 'forbidden'); } catch (_) { socket.destroy(); }
    });
  }
});

server.listen(8082, () => {
  console.log('demo server listening on http://localhost:8082');
  console.log('Connect as normal client: ws://localhost:8082/?token=alice-token (admin) or ?token=bob-token (user)');
  console.log('Open dashboard: http://localhost:8082/admin');
});
```
