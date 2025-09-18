# ws13 admin extension

## Features
- Inspect registry: `getConnections({ page, perPage, filter })`
- Summary: `getSummary()`
- Export: `exportJSON({ filter })` and `exportCSV({ filter })`
- Actions: `disconnectByIp(ip)`
- Live dashboard: `registerListener(ws)` and `broadcastUpdate(payload)`
- HTTP convenience handler: `httpHandler(req, res)` for simple integration

---

## RBAC and authorization
- createAdmin accepts `authorize(ctx)` (sync or async) and/or `requireRole` to secure listener registration and HTTP endpoints.
- `authorize(ctx)` receives `{ req, ws, token, user }` and should return boolean or Promise<boolean>.
- If `authorize` is not provided and `requireRole` is set, the admin will check `ws.auth.roles` by default.

---

## Pagination & filtering
- getConnections supports page/perPage and filter object (keys: ip, url, readyState, authUser, role).
- exportCSV/JSON support the same filter option.

---

## Usage example:

```js
const { createAdmin } = require('ws13/extensions/admin');
const admin = createAdmin(registry, { authorize: myAuthFn, requireRole: 'admin' });

app.get('/admin/*', (req, res) => admin.httpHandler(req, res));
```

---

## Example: ws13/extensions/admin/examples/server.js

It demonstrates:
- core attachServer
- simple auth via query token
- admin endpoints and admin WebSocket for live updates

```js
/**
 * Minimal admin server example
 * Run: node server.js
 */

const http = require('http');
const url = require('url');
const createWebSocket = require('../../../core');
const { createAdmin } = require('../index');

const server = http.createServer(requestHandler);
const { registry } = createWebSocket.attachServer(server, {
  onConnect(ws, req) {
    // attach minimal auth information for demo (token from query string)
    try {
      const q = new URL(req.url, `http://${req.headers.host}`).searchParams;
      const token = q.get('token');
      if (token === 'alice-token') ws.auth = { user: 'alice', roles: ['admin'] };
      if (token === 'bob-token') ws.auth = { user: 'bob', roles: ['user'] };
      ws._connectedAt = Date.now();
    } catch (_) {}
  }
});

// simple authorize function reading req.headers['x-admin-token'] or ws.auth
async function authorize(ctx) {
  // Accept if ws is already authenticated and has admin role
  if (ctx.ws && ctx.ws.auth && Array.isArray(ctx.ws.auth.roles) && ctx.ws.auth.roles.includes('admin')) return true;

  // or check a header token for HTTP endpoints
  if (ctx.req && ctx.req.headers && ctx.req.headers['x-admin-token'] === 'super-secret') return true;

  return false;
}

const admin = createAdmin(registry, { authorize, requireRole: 'admin' });

// HTTP endpoints
function requestHandler(req, res) {
  const p = new URL(req.url, `http://${req.headers.host}`).pathname;

  // Serve simple dashboard html
  if (p === '/admin') {
    res.setHeader('content-type', 'text/html');
    res.end(require('fs').readFileSync(__dirname + '/admin-dashboard.html', 'utf8'));
    return;
  }

  // wire admin endpoints
  if (p.startsWith('/admin')) {
    return admin.httpHandler(req, res);
  }

  res.end('ok');
}

// Admin dashboard WebSocket endpoint: register listener
server.on('upgrade', (req, socket, head) => {
  const pathname = req.url.split('?')[0];
  if (pathname === '/admin-socket') {
    // upgrade into ws13 and register listener
    const ws = createWebSocket({ request: req, heartbeatInterval_ms: 0 });
    admin.registerListener(ws).then(unreg => {
      console.log('admin dashboard connected');
      // unregister on close
      ws.on('close', () => { try { unreg(); } catch(_){}; });
    }).catch(err => {
      // not authorized
      try { ws.close(4003, 'Forbidden'); } catch(_) { socket.destroy(); }
    });
  }
});

// simulate periodic stats pushed to dashboard
setInterval(() => {
  admin.broadcastUpdate({ ts: Date.now(), summary: admin.getSummary() });
}, 5000);

server.listen(8080, () => console.log('Admin example listening on http://localhost:8080/admin'));
```

---

## Notes, security & integration

 - Authorization: the example authorize() is intentionally minimal. Replace with your actual auth/token validation. When authorize() is present it will be called for both HTTP handler and registerListener. You can also pass requireRole to do a quick role check on ws.auth.roles.
 - Pagination/filtering: getConnections accepts a filter object supporting ip, url, readyState, authUser, role.
 - httpHandler is a simple adapter intended for plain Node http servers. For Express apps, call admin.httpHandler(req, res) inside your route handler or wrap it to use req.query.
 - The example admin WebSocket registration demonstrates using createWebSocket's server-side attach + admin.registerListener(ws); in real deployments ensure the admin socket clients are authenticated by token/headers or TLS client certs.