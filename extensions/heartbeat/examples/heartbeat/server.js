/**
 * Heartbeat demo server
 * Run: node server.js
 *
 * Server replies with 'pong' string when it receives 'ping' payload to simulate pong.
 */

const http = require('http');
const createWebSocket = require('../../../core');
const { createHeartbeatManager } = require('../index');

const hb = createHeartbeatManager({ interval_ms: 5000, timeout_ms: 2000 });

const server = http.createServer();
const { registry } = createWebSocket.attachServer(server, {
    onConnect(ws, req) {
        hb.attach(ws, {
            interval_ms: 2000,
            timeout_ms: 1000,
            onTimeout: (s) => {
                console.log('client timed out', s.ip || s._id || '(unknown)');
                try { s.close(4000, 'heartbeat timeout'); } catch (_) { }
            }
        });

        ws.on('message', (ev) => {
            // simple behavior: if 'ping' then reply 'pong'
            try {
                if (typeof ev === 'string' && ev === 'ping') ws.send('pong');
            } catch (_) { }
        });

        ws.on('close', () => {
            hb.detach(ws);
        });
    }
});

server.listen(8090, () => console.log('heartbeat demo server on ws://localhost:8090'));
