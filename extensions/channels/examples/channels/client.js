/**
 * Demo client that joins channel and sends messages
 */
const http = require('http');
const createWebSocket = require('../../../core');

const token = 'alice-token'; // or bob-token
const req = http.request({ hostname: '127.0.0.1', port: 8083, path: '/?token=' + encodeURIComponent(token) });
const ws = createWebSocket({ request: req });

ws.on('open', () => {
    console.log('open');
    // send a channel publish message
    ws.send(JSON.stringify({ channel: 'general', payload: { text: 'hello from client' } }));
});

ws.on('message', (ev) => {
    try {
        const obj = JSON.parse(ev.data);
        console.log('chan msg', obj);
    } catch (e) { console.log('raw', ev.data); }
});

ws.on('close', () => console.log('closed'));
ws.on('error', console.error);
