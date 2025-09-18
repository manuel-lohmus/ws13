"use strict";

const { test } = require('../../../testRunner');
const http = require('http');
const createWebSocket = require('../../../core');
const { createEventAPI } = require('./index');

test("events: emit and on between client and server", (check, done) => {
    const server = http.createServer();
    const { registry } = createWebSocket.attachServer(server, {
        onConnect(ws, req) {
            const evt = createEventAPI();
            evt.attach(ws);

            // server-side handler
            ws.onEvent('greet', (data) => {
                try {
                    check('server received', data.msg).mustBe('hello');
                } catch (e) { done(e); }
                // respond via event
                ws.emitEvent('greet:reply', { msg: 'hi client' });
            });
        }
    });

    server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        const client = createWebSocket({ request: http.request({ hostname: '127.0.0.1', port, path: '/' }) });
        client.on('error', done);

        client.on('open', () => {
            const evt = createEventAPI();
            evt.attach(client);

            // client listens for reply
            client.onEvent('greet:reply', (data) => {
                try {
                    check('client got reply', data.msg).mustBe('hi client');
                    client.close(1000, 'ok');
                } catch (e) { done(e); }
            });

            // send greet event
            client.emitEvent('greet', { msg: 'hello' });
        });

        client.on('close', () => {
            server.close(() => done());
        });
    });
});

test("events: global handlers via manager.on", (check, done) => {
    const server = http.createServer();
    const evtManager = createEventAPI();

    const { registry } = createWebSocket.attachServer(server, {
        onConnect(ws, req) {
            evtManager.attach(ws);
        }
    });

    // global handler
    const unregister = evtManager.on('broadcast:*', (data, meta, raw) => {
        // global handler should run for events like "broadcast:hello"
        check('global handler fired', raw && raw.event && raw.event.startsWith('broadcast:')).mustBe(true);
    });

    server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        const client = createWebSocket({ request: http.request({ hostname: '127.0.0.1', port, path: '/' }) });
        client.on('error', done);

        client.on('open', () => {
            const ev = createEventAPI();
            ev.attach(client);
            client.emitEvent('broadcast:hello', { x: 1 });
            setTimeout(() => {
                unregister();
                client.close(1000, 'ok');
            }, 30);
        });

        client.on('close', () => server.close(() => done()));
    });
});
