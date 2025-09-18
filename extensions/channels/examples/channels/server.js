/**
 * Demo server using channels extension and persistent historyStore (SQLite)
 *
 * Run: node server.js
 *
 * - Uses persistent history via sqlite-adapter
 * - Replays channel history to newly joined clients
 */

const http = require('http');
const path = require('path');
const createWebSocket = require('../../../core');
const { createChannelsManager } = require('../index');
const { createAuth, defaultVerifier } = require('../../auth');
const { createSqliteHistory } = require('../../history/sqlite-adapter');

const tokens = { 'alice-token': { user: 'alice', roles: ['admin'] }, 'bob-token': { user: 'bob', roles: ['user'] } };
const auth = createAuth({ verifier: defaultVerifier(tokens) });

// create persistent history store (file stored next to this demo)
const dbPath = path.join(__dirname, 'data', 'channels-history.db');
const historyStore = createSqliteHistory(dbPath, { defaultLimit: 100, maxTotalItems: 5000 });

// channels manager backed by historyStore
const mgr = createChannelsManager({ historyLimit: 100, historyStore });

const server = http.createServer();
const { registry } = createWebSocket.attachServer(server, {
    onConnect(ws, req) {
        // authenticate during onConnect (token in query)
        auth.wsAuthenticate(ws, req).then(ok => {
            if (!ok) { ws.close(4001, 'unauthorized'); return; }

            // auto join general channel
            const chat = mgr.createChannel('general');

            // add / join the channel; only if permissionChecker allows (if configured)
            const joined = chat.add(ws);
            if (!joined) {
                ws.send(JSON.stringify({ status: 'join_denied', channel: 'general' }));
                return;
            }

            // replay persistent history to newly joined client
            try { chat.replayTo(ws); } catch (e) { /* best-effort */ }

            ws.on('message', (ev) => {
                // expect JSON messages like { channel, payload }
                let obj;
                try { obj = typeof ev === 'string' ? JSON.parse(ev) : ev; } catch (e) { return; }
                if (obj && obj.channel && obj.payload) {
                    const ch = mgr.getChannel(obj.channel);
                    if (ch) ch.publish(ws, obj.payload);
                }
            });

            ws.on('close', () => {
                chat.remove(ws);
            });
        }).catch(err => {
            try { ws.close(4001, 'unauthorized'); } catch (_) { }
        });
    }
});

server.listen(8083, () => console.log('channels demo listening on ws://localhost:8083 (try ?token=alice-token)'));
