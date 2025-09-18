/**
 * Minimal admin server example with persistent history replay on join
 * Run: node server.js
 *
 * - Uses createSqliteHistory and channels manager to persist messages
 * - Replays channel history for newly joined authenticated clients
 */

const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const createWebSocket = require('../../../core');
const { createAdmin } = require('../index');
const { createAuth, defaultVerifier } = require('../../auth');
const { createChannelsManager } = require('../../channels');
const { createSqliteHistory } = require('../../history/sqlite-adapter');

const server = http.createServer(requestHandler);

// simple token->role mapping for demo
const tokens = {
    'alice-token': { user: 'alice', roles: ['admin'] },
    'bob-token': { user: 'bob', roles: ['user'] }
};
const auth = createAuth({ verifier: defaultVerifier(tokens) });

// create persistent history store and channels manager
const dbPath = path.join(__dirname, 'data', 'admin-channels-history.db');
const historyStore = createSqliteHistory(dbPath, { defaultLimit: 200, maxTotalItems: 20000 });
const channelsMgr = createChannelsManager({ historyLimit: 200, historyStore });

// create core attachServer and registry
const { registry } = createWebSocket.attachServer(server, {
    onConnect(ws, req) {
        // attach auth and join default channel(s)
        auth.wsAuthenticate(ws, req).then(ok => {
            if (!ok) { ws.close(4001, 'unauthorized'); return; }

            // have the client join "general"
            const ch = channelsMgr.createChannel('general');
            ch.add(ws);

            // replay history for this client
            try { ch.replayTo(ws); } catch (_) { }

            ws.on('message', (ev) => {
                // accept channel publish messages as JSON { channel, payload }
                let obj;
                try { obj = typeof ev === 'string' ? JSON.parse(ev) : ev; } catch (e) { return; }
                if (obj && obj.channel && obj.payload) {
                    const c = channelsMgr.getChannel(obj.channel);
                    if (c) c.publish(ws, obj.payload);
                }
            });
        }).catch(err => {
            try { ws.close(4001, 'unauthorized'); } catch (_) { }
        });
    }
});

// simple authorize function for admin endpoints (accept X-ADMIN-TOKEN or ws.auth admin role)
async function authorize(ctx) {
    if (ctx.ws && ctx.ws.auth && Array.isArray(ctx.ws.auth.roles) && ctx.ws.auth.roles.includes('admin')) return true;
    if (ctx.req && ctx.req.headers && ctx.req.headers['x-admin-token'] === 'super-secret') return true;
    return false;
}

const admin = createAdmin(registry, { authorize, requireRole: 'admin', historyStore, channelsManager: channelsMgr });

// HTTP endpoints
function requestHandler(req, res) {
    const p = new URL(req.url, `http://${req.headers.host}`).pathname;

    // Serve simple dashboard html
    if (p === '/admin') {
        res.setHeader('content-type', 'text/html');
        res.end(fs.readFileSync(path.join(__dirname, 'admin-dashboard.html'), 'utf8'));
        return;
    }

    // wire admin endpoints
    if (p.startsWith('/admin')) {
        return admin.httpHandler(req, res);
    }

    res.end('ok');
}

// Admin dashboard WebSocket endpoint: register listener with RBAC
server.on('upgrade', (req, socket, head) => {
    const pathname = req.url.split('?')[0];
    if (pathname === '/admin-socket') {
        const ws = createWebSocket({ request: req, heartbeatInterval_ms: 0 });
        admin.registerListener(ws).then(unreg => {
            console.log('admin dashboard connected');
            ws.on('close', () => { try { unreg(); } catch (_) { }; });
        }).catch(err => {
            try { ws.close(4003, 'Forbidden'); } catch (_) { socket.destroy(); }
        });
    }
});

// simulate periodic stats pushed to dashboard
setInterval(() => {
    admin.broadcastUpdate({ ts: Date.now(), summary: admin.getSummary() });
}, 5000);

server.listen(8080, () => console.log('Admin example listening on http://localhost:8080/admin'));
