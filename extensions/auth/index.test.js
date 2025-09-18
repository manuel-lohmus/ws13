"use strict";

const { test } = require('../../../testRunner');
const http = require('http');
const createWebSocket = require('../../../core');
const { createAuth, defaultVerifier, attachAuthToServer, jwtVerifier } = require('./index');

test("auth: attachAuthToServer automatically authenticates and calls onConnect", (check, done) => {
    const tokens = { 'alice-token': { user: 'alice', roles: ['admin'] } };
    const auth = createAuth({ verifier: defaultVerifier(tokens) });

    const server = http.createServer();
    const { registry } = createWebSocket.attachServer(server, {
        // leave onConnect empty; we will provide one via attachAuthToServer options
    });

    // detach default upgrade handler and reattach via attachAuthToServer
    server.removeAllListeners('upgrade');

    attachAuthToServer(server, auth, {
        createWebSocket,
        registry,
        onConnect: (ws, req) => {
            check('ws has auth user', ws.auth.user).mustBe('alice');
            // close and end
            ws.close(1000, 'ok');
        },
        onAuthFailed: (req, socket) => {
            // ensure socket is destroyed when auth fails
            try { socket.destroy(); } catch (_) { }
        }
    });

    server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        const req = http.request({ hostname: '127.0.0.1', port, path: '/?token=alice-token' });
        const client = createWebSocket({ request: req });

        client.on('close', () => server.close(() => done()));
        client.on('error', done);
    });
});

test("auth: jwtVerifier validates HS256 token", (check, done) => {
    // create a simple HS256 JWT for test: header.payload.signature (no libs)
    const crypto = require('node:crypto');

    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'bob', roles: ['user'], exp: Math.floor(Date.now() / 1000) + 60 })).toString('base64url');
    const secret = 'shhh-its-secret';
    const signingInput = header + '.' + payload;
    const sig = crypto.createHmac('sha256', secret).update(signingInput).digest('base64url');
    const token = `${header}.${payload}.${sig}`;

    const verify = jwtVerifier(secret, { algorithms: ['HS256'] });

    verify(token).then(res => {
        check('jwt ok', res.ok).mustBe(true);
        check('jwt user', res.user).mustBe('bob');
        check('jwt roles array', Array.isArray(res.roles)).mustBe(true);
        done();
    }).catch(done);
});
