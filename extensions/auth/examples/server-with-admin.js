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
    onAuthFailed: (req, socket) => { try { socket.destroy(); } catch (_) { } }
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
