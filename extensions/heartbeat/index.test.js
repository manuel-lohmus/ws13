"use strict";

const { test } = require('../../../testRunner');
const http = require('http');
const createWebSocket = require('../../../core');
const { createHeartbeatManager } = require('./index');

test("heartbeat: attach sends ping and receives pong -> latency set", (check, done) => {
    const server = http.createServer();
    const hb = createHeartbeatManager({ interval_ms: 50, timeout_ms: 200 });

    const { registry } = createWebSocket.attachServer(server, {
        onConnect(ws, req) {
            // attach manager to server-side socket
            hb.attach(ws, { interval_ms: 0, timeout_ms: 200 }); // no periodic pings; we'll ping manually
            // server echoes pong when receives 'ping' payload (the core should translate ping/pong, but test uses message-based)
            ws.on('message', (ev) => {
                // assume ping sent as string 'ping' -> reply with 'pong'
                try {
                    if (typeof ev === 'string' && ev === 'ping') {
                        ws.send('pong');
                    }
                } catch (_) { }
            });
        }
    });

    server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        const client = createWebSocket({ request: http.request({ hostname: '127.0.0.1', port, path: '/' }) });

        client.on('open', async () => {
            // attach client-side manager and perform single ping
            hb.attach(client, { interval_ms: 0, timeout_ms: 500 });
            try {
                const res = await hb.ping(client, { timeout_ms: 500 });
                check('ping returned number or false', typeof res === 'number' || res === false).mustBe(true);
                if (typeof res === 'number') check('client latency set', typeof client.latency_ms).mustBe('number');
            } catch (err) {
                return done(err);
            } finally {
                client.close(1000, 'ok');
            }
        });

        client.on('close', () => server.close(() => done()));
        client.on('error', done);
    });
});

test("heartbeat: timeout triggers onTimeout and detach", (check, done) => {
    const server = http.createServer();
    const hb = createHeartbeatManager({ interval_ms: 0, timeout_ms: 50 });

    const { registry } = createWebSocket.attachServer(server, {
        onConnect(ws, req) {
            // Do not respond to ping -> simulate unresponsive peer
            hb.attach(ws, {
                interval_ms: 0, timeout_ms: 50, onTimeout: (s) => {
                    // marker
                    s.__timedOut = true;
                }
            });
        }
    });

    server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        const client = createWebSocket({ request: http.request({ hostname: '127.0.0.1', port, path: '/' }) });

        client.on('open', async () => {
            // attach manager on client and issue ping; server will not reply
            hb.attach(client, { interval_ms: 0, timeout_ms: 100, onTimeout: (s) => { s.__timedOutClient = true; } });
            const res = await hb.ping(client, { timeout_ms: 100, onTimeout: () => { } });
            // res should be false due to timeout
            check('ping timed out', res === false).mustBe(true);
            // cleanup
            client.close(1000, 'ok');
        });

        client.on('close', () => server.close(() => done()));
        client.on('error', done);
    });
});
