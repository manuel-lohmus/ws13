"use strict";

const { test } = require('../../../testRunner');
const http = require('http');
const createWebSocket = require('../../../core');
const { createAdmin } = require('./index');

test("admin: basic API surface", (check, done) => {
    const server = http.createServer();
    const { registry } = createWebSocket.attachServer(server, {
        onConnect(ws) {
            // attach small metadata for test
            ws.auth = { user: "alice", roles: ["admin"] };
            ws._connectedAt = Date.now();
        }
    });

    server.listen(0, "127.0.0.1", () => {
        const port = server.address().port;
        const client = createWebSocket({
            request: http.request({ hostname: '127.0.0.1', port, path: '/' })
        });

        client.on('open', () => {
            const admin = createAdmin(registry);

            const conns = admin.getConnections();
            check("connections array", Array.isArray(conns)).mustBe(true);
            check("summary shape", typeof admin.getSummary().total).mustBe("number");

            const json = admin.exportJSON();
            check("exportJSON string", typeof json).mustBe("string");

            const csv = admin.exportCSV();
            check("exportCSV string", typeof csv).mustBe("string");
            check("csv has header", csv.split("\n")[0].includes("ip")).mustBe(true);

            // register a listener (mock)
            const fakeListener = { send: (m) => { fakeListener._last = m; } };
            const unregister = admin.registerListener(fakeListener);
            check("listener received init", fakeListener._last?.includes('"admin:init"')).mustBe(true);

            // broadcast update
            admin.broadcastUpdate({ note: "hello" });
            check("listener received update", fakeListener._last?.includes('"admin:update"')).mustBe(true);

            // disconnect by ip (should disconnect test client)
            const ip = conns[0]?.ip || client.ip;
            const disconnected = admin.disconnectByIp(ip);
            check("disconnectByIp returned number", typeof disconnected).mustBe("number");

            unregister();

            // close client then server
            client.close(1000, "ok");
        });

        client.on('close', () => server.close(() => done()));
        client.on('error', done);
    });
});
