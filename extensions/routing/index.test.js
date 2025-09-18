"use strict";

const { test } = require('../../../testRunner');
const http = require('http');
const createWebSocket = require('../../../core');
const { createRouter } = require('./index');
const { createChannelsManager } = require('../channels');
const { createMessageMeta } = require('../message-meta');

test("routing + message-meta: route message to channel with meta and replay to member", (check, done) => {
    const server = http.createServer();
    const mgr = createChannelsManager({ historyLimit: 10 });
    const ch = mgr.createChannel('rooms');

    const mm = createMessageMeta();
    const router = createRouter({
        rules: [
            { name: 'route-rooms', match: { prefix: 'room:' }, action: { type: 'channel', channel: 'rooms' } }
        ],
        messageMeta: mm,
        metaField: '__meta'
    });

    const { registry } = createWebSocket.attachServer(server, {
        onConnect(ws, req) {
            router.attachToSocket(ws, { channelsManager: mgr });
            ch.add(ws);
            ws.on('message', () => { });
        }
    });

    server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;

        // create receiver client that will join channel (server auto-added)
        const reqR = http.request({ hostname: '127.0.0.1', port, path: '/' });
        const receiver = createWebSocket({ request: reqR });

        receiver.on('open', () => {
            // after receiver is connected, create sender and send a message that routes to channel
            const reqS = http.request({ hostname: '127.0.0.1', port, path: '/' });
            const sender = createWebSocket({ request: reqS });

            sender.on('open', async () => {
                // use message-meta to wrap outgoing message
                mm.attach(sender);
                const frame = (await mm.wrapOutgoing(sender, 'room:hello-from-sender', { channel: 'rooms' })).frame;
                sender.send(frame);
            });

            // receiver should get a message from the channel with meta included
            receiver.on('message', (ev) => {
                try {
                    const obj = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data;
                    // expecting wrapped object with __meta present
                    check('received has meta', obj && obj.__meta && typeof obj.__meta.id === 'string').mustBe(true);
                    // payload contained in the object (string or data)
                    server.close(() => {
                        receiver.close();
                        done();
                    });
                } catch (e) {
                    // ignore parse errors
                }
            });

            sender.on('error', done);
        });

        receiver.on('error', done);
    });
});

test("routing: transform and forward with message-meta reply (uppercase example)", (check, done) => {
    const server = http.createServer();

    const mm = createMessageMeta();
    const router = createRouter({
        rules: [
            {
                name: 'upper-transform',
                match: { prefix: 'upper:' },
                action: {
                    type: 'transform',
                    fn: (payload) => {
                        const s = String(payload);
                        const rest = s.slice('upper:'.length);
                        return { payload: rest.toUpperCase() };
                    }
                }
            },
            {
                name: 'upper-reply',
                match: { prefix: 'upper:' },
                action: {
                    type: 'forward',
                    to: (payload, meta, ctx) => {
                        // use message-meta reply helper if available
                        if (ctx.ws && typeof ctx.ws.replyMeta === 'function') {
                            return ctx.ws.replyMeta({ transformed: payload }, { meta: null });
                        }
                        try { ctx.ws.send(JSON.stringify({ transformed: payload })); } catch (_) { }
                    }
                }
            }
        ],
        messageMeta: mm
    });

    const { registry } = createWebSocket.attachServer(server, {
        onConnect(ws, req) { router.attachToSocket(ws, {}); }
    });

    server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        const client = createWebSocket({ request: http.request({ hostname: '127.0.0.1', port, path: '/' }) });

        client.on('open', async () => {
            mm.attach(client);
            const frame = (await mm.wrapOutgoing(client, 'upper:hello', { channel: null })).frame;
            client.send(frame);
        });

        client.on('message', (ev) => {
            try {
                const o = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data;
                // expecting message meta-wrapped reply or plain transformed JSON
                const payload = (o && o.__meta) ? o : o;
                // accept either { transformed: 'HELLO' } or { transformed: 'HELLO' } wrapped
                const candidate = (o && o.transformed) ? o.transformed : (o && o.payload && o.payload.transformed);
                check('transformed reply', candidate === 'HELLO').mustBe(true);
                client.close(1000, 'ok');
            } catch (e) { }
        });

        client.on('close', () => server.close(() => done()));
        client.on('error', done);
    });
});
