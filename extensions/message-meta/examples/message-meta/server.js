/**
 * Demo server for message-meta
 *
 * Run: node server.js
 *
 * - attaches message-meta to sockets and echoes messages with meta
 */

const http = require('http');
const createWebSocket = require('../../../core');
const { createMessageMeta } = require('../index');

const mm = createMessageMeta({ perConnectionSequence: true });

const server = http.createServer();
const { registry } = createWebSocket.attachServer(server, {
    onConnect(ws, req) {
        mm.attach(ws);
        ws.on('message', (ev) => {
            const parsed = mm.parseIncoming(ev.data || ev);
            if (parsed.ok) {
                // echo back with same meta
                const frame = JSON.stringify({ echo: parsed.payload, __meta: parsed.meta });
                ws.send(frame);
            } else {
                ws.send(JSON.stringify({ error: parsed.reason || 'bad' }));
            }
        });
    }
});

server.listen(8096, () => console.log('message-meta demo on ws://localhost:8096'));