/**
 * Demo routing server (message-meta integrated)
 *
 * - routes messages starting with "room:" into channel 'rooms'
 * - wraps outgoing messages with message-meta so members receive meta
 */

const http = require('http');
const path = require('path');
const createWebSocket = require('../../../core');
const { createRouter } = require('../index');
const { createChannelsManager } = require('../../channels');
const { createMessageMeta } = require('../../message-meta');

const mgr = createChannelsManager({ historyLimit: 50 });
mgr.createChannel('rooms');

const mm = createMessageMeta({ perConnectionSequence: true });

const router = createRouter({
    rules: [
        { name: 'room-route', match: { prefix: 'room:' }, action: { type: 'channel', channel: 'rooms' } },
        {
            name: 'upper',
            match: { prefix: 'upper:' },
            action: {
                type: 'transform',
                fn: (payload) => {
                    const s = String(payload);
                    const rest = s.slice('upper:'.length);
                    return { payload: rest.toUpperCase() };
                }
            }
        },
        {
            name: 'upper-reply',
            match: { prefix: 'upper:' },
            action: {
                type: 'forward', to: (payload, meta, ctx) => {
                    try { ctx.ws.send(JSON.stringify({ upper: payload })); } catch (_) { }
                }
            }
        }
    ],
    onRoute: (info, ctx) => console.log('routed:', info),
    messageMeta: mm, // integrate message-meta automatically
    metaField: '__meta'
});

const server = http.createServer();
const { registry } = createWebSocket.attachServer(server, {
    onConnect(ws, req) {
        // ensure message-meta attaches (router.attachToSocket does this)
        router.attachToSocket(ws, { channelsManager: mgr });

        // join rooms channel automatically for demo
        const c = mgr.getChannel('rooms');
        c.add(ws);

        ws.on('message', (ev) => {
            // router.attachToSocket already handles messages; log raw incoming for demo
            console.log('incoming raw', ev.data || ev);
        });

        ws.on('close', () => { c.remove(ws); });
    }
});

server.listen(8098, () => console.log('routing demo on ws://localhost:8098'));
