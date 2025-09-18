// minimal example: start server and accept ws with token query
const http = require('http');
const createWebSocket = require('../../../core');
const { createAuth, defaultVerifier } = require('../index');

const tokens = { 'alice-token': { user: 'alice', roles: ['admin'] }, 'bob-token': { user: 'bob', roles: ['user'] } };
const auth = createAuth({ verifier: defaultVerifier(tokens) });

const server = http.createServer();
const { registry } = createWebSocket.attachServer(server, {
    onConnect: (ws, req) => {
        auth.wsAuthenticate(ws, req).then(ok => {
            if (!ok) { ws.close(4001, 'unauthorized'); return; }
            console.log('connected', ws.auth.user, ws.auth.roles);
            ws.send(`welcome ${ws.auth.user}`);
            ws.on('message', ev => {
                ws.send(`[${ws.auth.user}] ${ev.data}`);
            });
        }).catch(err => {
            ws.close(4001, 'unauthorized');
        });
    }
});

server.listen(8081, () => console.log('auth demo server running on http://localhost:8081/?token=alice-token'));