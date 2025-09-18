/**
 * history demo server
 * run: node server.js
 *
 * - stores messages per-channel using history extension
 * - supports a simple replay via message: { cmd: 'replay', channel }
 */

const http = require('http');
const createWebSocket = require('../../../core');
const { createHistoryStore } = require('../index');

const hs = createHistoryStore({ defaultLimit: 50, maxTotalItems: 1000 });

const server = http.createServer();
const { registry } = createWebSocket.attachServer(server, {
    onConnect(ws, req) {
        ws.on('message', (ev) => {
            let msg;
            try { msg = typeof ev === 'string' ? JSON.parse(ev) : ev; } catch (e) { return; }
            if (!msg) return;
            if (msg.cmd === 'publish' && msg.channel) {
                hs.append(msg.channel, { from: msg.from || 'anon', text: msg.text, ts: Date.now() });
                // echo to sender as ack
                ws.send(JSON.stringify({ status: 'ok', channel: msg.channel }));
            }
            else if (msg.cmd === 'replay' && msg.channel) {
                const items = hs.list(msg.channel, { limit: 50, reverse: false });
                ws.send(JSON.stringify({ cmd: 'replay', channel: msg.channel, items }));
            }
        });
    }
});

server.listen(8095, () => console.log('history demo running on ws://localhost:8095'));