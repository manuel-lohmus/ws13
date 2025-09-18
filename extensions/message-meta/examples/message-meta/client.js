/**
 * Demo client for message-meta
 */
const http = require('http');
const createWebSocket = require('../../../core');
const { createMessageMeta } = require('../index');

const mm = createMessageMeta({ perConnectionSequence: true });

const req = http.request({ hostname: '127.0.0.1', port: 8096, path: '/' });
const ws = createWebSocket({ request: req });

ws.on('open', async () => {
    mm.attach(ws);
    const { frame } = await mm.wrapOutgoing(ws, { hello: 'world' });
    ws.send(frame);
});

ws.on('message', (ev) => {
    const parsed = mm.parseIncoming(ev.data || ev);
    console.log('server replied', parsed);
    ws.close(1000, 'done');
});

ws.on('error', console.error);
ws.on('close', () => console.log('closed'));
