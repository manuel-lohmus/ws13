"use strict";

const { test } = require('../../../testRunner');
const http = require('http');
const createWebSocket = require('../../../core');
const { createMessageMeta } = require('./index');

test("message-meta: wrapOutgoing adds meta and parseIncoming extracts it", (check, done) => {
    const mm = createMessageMeta();
    const server = http.createServer();

    const { registry } = createWebSocket.attachServer(server, {
        onConnect(ws, req) {
            mm.attach(ws);
            ws.on('message', (ev) => {
                const parsed = mm.parseIncoming(ev.data || ev);
                check('incoming ok', parsed.ok).mustBe(true);
                check('meta present', parsed.meta && typeof parsed.meta.id === 'string').mustBe(true);
                // echo back payload
                ws.send(JSON.stringify({ echo: parsed.payload, __meta: parsed.meta }));
            });
        }
    });

    server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        const client = createWebSocket({ request: http.request({ hostname: '127.0.0.1', port, path: '/' }) });

        client.on('open', async () => {
            const sent = await createMessageMeta().wrapOutgoing(client, { hello: 'world' });
            client.send(sent.frame);
        });

        client.on('message', (ev) => {
            const parsed = createMessageMeta().parseIncoming(ev.data || ev);
            check('echo meta ok', parsed.ok).mustBe(true);
            check('echo payload', parsed.payload && parsed.payload.echo && parsed.payload.echo.hello === 'world').mustBe(true);
            client.close(1000, 'ok');
        });

        client.on('close', () => server.close(() => done()));
        client.on('error', done);
    });
});

test("message-meta: attachToChannel wraps published payloads automatically", (check, done) => {
    const { createChannelsManager } = require('../channels');
    const mm = createMessageMeta();
    const mgr = createChannelsManager({ historyLimit: 10 });
    const ch = mgr.createChannel('meta-test');

    // server side: create ws-like mocks
    const a = { send: (d) => { a._last = d; }, on: () => { }, auth: { user: 'alice' }, ip: '1.2.3.4' };
    ch.add(a);
    mm.attachToChannel(ch);

    (async () => {
        await ch.publish(a, { text: 'hi' });
        const parsed = mm.parseIncoming(a._last);
        check('wrapped contains meta', parsed.ok && parsed.meta && parsed.meta.channel === 'meta-test').mustBe(true);
        done();
    })().catch(done);
});
