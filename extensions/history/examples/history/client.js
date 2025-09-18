/**
 * history demo client
 */
const http = require('http');
const createWebSocket = require('../../../core');

const req = http.request({ hostname: '127.0.0.1', port: 8095, path: '/' });
const ws = createWebSocket({ request: req });

ws.on('open', () => {
    // publish some messages
    ws.send(JSON.stringify({ cmd: 'publish', channel: 'general', text: 'hello 1', from: 'alice' }));
    ws.send(JSON.stringify({ cmd: 'publish', channel: 'general', text: 'hello 2', from: 'alice' }));

    // request replay
    ws.send(JSON.stringify({ cmd: 'replay', channel: 'general' }));
});

ws.on('message', (ev) => {
    try {
        const msg = typeof ev === 'string' ? JSON.parse(ev) : ev;
        if (msg.cmd === 'replay') {
            console.log('replay items:', msg.items);
            ws.close(1000, 'done');
        } else {
            console.log('msg', msg);
        }
    } catch (e) { console.error(e); }
});

ws.on('close', () => console.log('closed'));
