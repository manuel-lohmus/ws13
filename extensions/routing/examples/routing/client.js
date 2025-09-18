/**
 * Demo routing client (sends messages wrapped with message-meta)
 *
 * - demonstrates sending a message that will be routed to channel 'rooms'
 * - shows transformed reply case
 */

const http = require('http');
const createWebSocket = require('../../../core');
const { createMessageMeta } = require('../../message-meta');

const mm = createMessageMeta({ perConnectionSequence: true });

async function run() {
    const req = http.request({ hostname: '127.0.0.1', port: 8098, path: '/' });
    const ws = createWebSocket({ request: req });

    ws.on('open', async () => {
        // attach mm locally for constructing frames
        mm.attach(ws);

        // send a room message (payload is a plain string; meta will be added by mm.wrapOutgoing)
        const frame1 = (await mm.wrapOutgoing(ws, 'room:hello from client', { channel: 'rooms' })).frame;
        ws.send(frame1);

        // send an upper: message to trigger transform+reply flow
        const frame2 = (await mm.wrapOutgoing(ws, 'upper:please shout', { channel: null })).frame;
        ws.send(frame2);
    });

    ws.on('message', (ev) => {
        try {
            // messages from server are meta-wrapped JSON; parse and print
            const obj = typeof ev.data === 'string' ? JSON.parse(ev.data) : (ev.data || ev);
            console.log('received', obj);
        } catch (e) {
            console.log('raw', ev.data || ev);
        }
    });

    ws.on('close', () => console.log('client closed'));
    ws.on('error', console.error);
}

run().catch(console.error);
