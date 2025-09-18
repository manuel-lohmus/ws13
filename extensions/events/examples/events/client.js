/**
 * Minimal client demonstrating events extension
 */
const http = require('http');
const createWebSocket = require('../../../core');
const { createEventAPI } = require('../index');

const req = http.request({ hostname: '127.0.0.1', port: 8084, path: '/' });
const ws = createWebSocket({ request: req });

ws.on('open', () => {
    const evt = createEventAPI();
    evt.attach(ws);

    ws.onEvent('joined:ack', (data) => {
        console.log('joined acknowledged', data);
        ws.close(1000, 'bye');
    });

    ws.emitEvent('join', { user: 'alice' });
});

ws.on('error', console.error);
ws.on('close', () => console.log('closed'));
