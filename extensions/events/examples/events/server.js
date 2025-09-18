/**
 * Minimal server demonstrating events extension
 */
const http = require('http');
const createWebSocket = require('../../../core');
const { createEventAPI } = require('../index');

const server = http.createServer();
const evtManager = createEventAPI();

const { registry } = createWebSocket.attachServer(server, {
    onConnect(ws, req) {
        evtManager.attach(ws);

        // per-connection handler
        ws.onEvent('join', (data) => {
            console.log('user joined', data.user);
            // broadcast to this socket only as demo
            ws.emitEvent('joined:ack', { ok: true, user: data.user });
        });
    }
});

server.listen(8084, () => console.log('events demo server listening on ws://localhost:8084'));
