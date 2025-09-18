// client connecting with token in query string
const http = require('http');
const createWebSocket = require('../../../core');

const token = 'alice-token';
const req = http.request({ hostname: '127.0.0.1', port: 8081, path: '/?token=' + encodeURIComponent(token) });
const ws = createWebSocket({ request: req });

ws.on('open', () => {
    console.log('open');
    ws.send('hello from client');
});
ws.on('message', (ev) => {
    console.log('msg', ev.data);
});
ws.on('close', () => console.log('closed'));
ws.on('error', console.error);
