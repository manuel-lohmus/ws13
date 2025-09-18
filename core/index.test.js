/**  Copyright (c) Manuel Lõhmus (MIT License). */

"use strict";

const http = require('node:http');
const WebSocket = require('./index');
const createPermessageDeflate = require('./permessage-deflate');
const port = process.env.PORT || 3000;
const testRunner = require('../testRunner');

testRunner("WS - Tests            ", { skip: false, timeout: 150000 }, (test) => {

    //
    // Server + basic echo / lifecycle tests (original suite)
    //
    test("ws13 > Server                                             ", { skip: false }, (check, done) => {
        const server = http.createServer();
        let wsList = [];

        server.on('error', done);
        server.listen(port, 'localhost');

        server.on('upgrade', function upgrade(request) {
            const ws = WebSocket({
                request,
                protocol: 'test',
                origin: 'http://localhost:' + port,
                binaryType: 'arraybuffer',
                heartbeatInterval_ms: 10
            });

            if (ws) {
                wsList.push(ws);
                ws.on('error', done);

                ws.on('open', function () {
                    ws.isOpened = true;
                    ws.send(JSON.stringify({
                        status: 'isOpen',
                        headers: request.headers,
                        path: request.url
                    }));
                    ws.send(JSON.stringify({ status: 'isEcho' }));
                });

                ws.on('message', function (ev) {
                    if (ev.data === 'close') return ws.close(1000, 'Normal closure.');
                    if (ev.isBinary) ws.send(ev.data);
                    else {
                        ev.status = 'isEcho';
                        ws.send(JSON.stringify(ev));
                    }
                });

                ws.on('pong', function () {
                    ws.heartbeatInterval_ms = 0;
                    ws.isPonged = true;
                });

                ws.on('close', function (ev) {
                    wsList = wsList.filter(s => s !== this);
                    check('isOpened', ws.isOpened).mustBe(true);
                    check('isPonged', ws.isPonged).mustBe(true);
                    check('code', ev.code).mustBe(1000);
                    check('reason', ev.reason).mustBe('Normal closure.', '');
                    setTimeout(closeServer);
                });
            } else { request.socket.end(); }
        });

        server.on('close', done);

        function closeServer() { if (!wsList.length) server.close(); }
    });

    test("ws13 > Client-mode                                        ", { skip: false }, (check, done) => {
        const ws = WebSocket({
            request: http.request({ hostname: 'localhost', port, path: '/test' }),
            protocol: 'chat, test',
            origin: 'http://localhost',
            binaryType: 'arraybuffer'
        });

        ws.on('error', done);
        ws.on('open', function (ev) { onOpen.call(this, ev, check, done); });
        ws.on('message', function (ev) { onMessage.call(this, ev, check, done); });
        ws.on('ping', function (ev) { onPing.call(this, ev, check, done); });
        ws.on('close', function (ev) { onClose.call(this, ev, check, done); });

        check('readyState', ws.readyState).mustBe(0);
    });

    test("ws13 > Client-mode > close                                ", { skip: false }, (check, done) => {
        const ws = WebSocket({
            request: http.request({ hostname: 'localhost', port, path: '/test' }),
            protocol: 'chat, test',
            origin: 'http://localhost',
            binaryType: 'arraybuffer'
        });

        ws.on('error', done);
        ws.on('open', function (ev) { onOpen.call(this, ev, check, done); });
        ws.on('message', function (ev) {
            setTimeout(() => {
                ws.close(1000, 'Normal closure.');
                check('readyState', ws.readyState).mustBe(3);
            }, 100);
        });
        ws.on('ping', function (ev) { onPing.call(this, ev, check, done); });
        ws.on('close', function (ev) { onClose.call(this, ev, check, done); });

        check('readyState', ws.readyState).mustBe(0);
    });

    //
    // Optional native http.WebSocket tests (if available)
    //
    test("http > native http.WebSocket                              ", { skip: http.WebSocket === undefined }, (check, done) => {
        const ws = new http.WebSocket(`ws://localhost:${port}/test`, ['chat', 'test']);
        ws.binaryType = "arraybuffer";
        ws.onerror = function (ev) { done(ev.message); };
        ws.onopen = function (ev) { onOpen.call(this, ev, check, done); };
        ws.onmessage = function (ev) { onMessage.call(this, ev, check, done); };
        ws.onclose = function (ev) { onClose.call(this, ev, check, done); };

        check('readyState', ws.readyState).mustBe(0);
    });

    test("http > native http.WebSocket > close                      ", { skip: http.WebSocket === undefined }, (check, done) => {
        const ws = new http.WebSocket(`ws://localhost:${port}/test`, ['chat', 'test']);
        ws.binaryType = "arraybuffer";
        ws.onerror = function (ev) { done(ev.message); };
        ws.onopen = function (ev) { onOpen.call(this, ev, check, done); };
        ws.onmessage = function (ev) {
            setTimeout(() => {
                ws.close(1000, 'Normal closure.');
                check('readyState', ws.readyState).mustBe(2);
            }, 100);
        };
        ws.onclose = function (ev) { onClose.call(this, ev, check, done); };

        check('readyState', ws.readyState).mustBe(0);
    });

    //
    // Additional focused tests for core utilities
    //

    test("registry: add/delete/broadcast and auto-clean             ", { skip: false }, (check, done) => {
        const registry = WebSocket.createRegistry ? WebSocket.createRegistry() : WebSocket.createRegistry();
        function mk() {
            const ev = {};
            const ws = {
                readyState: WebSocket.OPEN,
                send: (d) => ev.sent.push(d),
                on: (name, fn) => { ev[name] = fn; },
                triggerClose: () => ev.close && ev.close({ code: 1000, reason: 'ok', wasClean: true }),
                events: ev,
                __sent: (ev.sent = []),
                CONNECTING: 0,
                OPEN: 1,
                CLOSING: 2,
                CLOSED: 3,
            };
            return ws;
        }

        const a = mk();
        const b = mk();

        registry.add(a);
        registry.add(b);

        check('size after add', registry.size()).mustBe(2);

        registry.broadcast('hello');
        setTimeout(() => {
            check('a received', a.__sent[0]).mustBe('hello');
            check('b received', b.__sent[0]).mustBe('hello');

            // simulate close on a: registry should auto-remove
            a.events.close && a.events.close();
            setTimeout(() => {
                check('size after a close', registry.size()).mustBe(1);

                // delete b manually
                registry.delete(b);
                check('size after delete', registry.size()).mustBe(0);

                done();
            }, 30);
        }, 30);
    });

    test("handshake: attachServer + simple onConnect                ", { skip: false }, (check, done) => {
        const server = http.createServer();
        const { registry } = WebSocket.attachServer(server, {
            onConnect(ws /*, req */) {
                check('ws.readyState', typeof ws.readyState).mustBe('number');
                check('ws.ip present', typeof ws.ip).mustBe('string');
                ws.send('hi');
                setTimeout(() => ws.close(1000, 'ok'), 20);
            }
        });

        server.listen(0, '127.0.0.1', () => {
            const portLocal = server.address().port;
            const clientReq = http.request({ hostname: '127.0.0.1', port: portLocal, path: '/' });
            const client = WebSocket({ request: clientReq, protocol: '' });

            client.on('error', (err) => done(err));
            client.on('open', () => {
                check('client readyState open', client.readyState).mustBe(1);
            });
            client.on('message', (ev) => {
                check('received reply', ev.data).mustBe('hi');
            });
            client.on('close', () => {
                server.close(() => done());
            });
        });
    });

    test("permessage-deflate: basic compress/decompress flow        ", { skip: false }, (check, done) => {
        const ext = createPermessageDeflate({ maxDecompressSize: 1024 * 1024 });

        const msg = { isFin: true, opcode: 1, payload: Buffer.from('hello world'), payloadLength: 11 };

        // outgoing -> deflate
        ext.processOutgoingMessage(msg, (err, outFrame) => {
            if (err) return done(err);
            check('rsv1 set', outFrame.isRsv1).mustBe(true);
            check('payload changed', Buffer.isBuffer(outFrame.payload)).mustBe(true);

            const incoming = {
                isFin: true,
                isRsv1: outFrame.isRsv1,
                opcode: outFrame.opcode,
                payload: outFrame.payload,
                payloadLength: outFrame.payload.length
            };

            // incoming -> inflate
            ext.processIncomingMessage(incoming, (err2, inMsg) => {
                if (err2) return done(err2);
                check('decompressed payload equals original', inMsg.payload.toString('utf8')).mustBe('hello world');
                done();
            });
        });
    });

    test("permessage-deflate: rejects oversized decompressed payload", { skip: false }, (check, done) => {
        const ext = createPermessageDeflate({ maxDecompressSize: 8 });
        const msg = { isFin: true, opcode: 1, payload: Buffer.from('a'.repeat(100)), payloadLength: 100 };

        ext.processOutgoingMessage(msg, (err, outFrame) => {
            if (err) return done(err);

            const incoming = {
                isFin: true,
                isRsv1: outFrame.isRsv1,
                opcode: outFrame.opcode,
                payload: outFrame.payload,
                payloadLength: outFrame.payload.length
            };

            ext.processIncomingMessage(incoming, (err2) => {
                check('error on oversized', Boolean(err2)).mustBe(true);
                done();
            });
        });
    });

    test("heartbeat: ping/pong measures latency and cancels timeout ", { skip: false }, (check, done) => {
        const server = http.createServer();
        const { registry } = WebSocket.attachServer(server, {
            onConnect(ws) {
                ws.heartbeatInterval_ms = 20;
                ws.on('pong', () => {
                    check('latency numeric', typeof ws.latency_ms).mustBe('number');
                    ws.close(1000, 'ok');
                });
            }
        });

        server.listen(0, '127.0.0.1', () => {
            const portLocal = server.address().port;
            const client = WebSocket({
                request: http.request({ hostname: '127.0.0.1', port: portLocal, path: '/' }),
                heartbeatInterval_ms: 20
            });

            client.on('open', () => {
                client.heartbeat((latency) => {
                    check('client heartbeat callback', typeof latency).mustBe('number');
                });
            });

            client.on('close', () => {
                server.close(done);
            });

            client.on('error', done);
        });
    });

    //
    // Helper callbacks used by multiple tests (kept after tests)
    //
    function onOpen(ev, check /*, done */) {
        check('readyState', this.readyState).mustBe(1);
        this.isOpened = true;
    }
    function onMessage(ev, check, done) {
        if (ev.isBinary || ev.data instanceof ArrayBuffer) {
            binaryMessageCheck.call(this, ev.data, check, done);
            return;
        }

        const obj = parse(ev.data, done);
        switch (obj.status) {
            case 'isOpen':
                openMessageCheck.call(this, obj, check, done);
                break;
            case 'isEcho':
                // echoMessageCheck intentionally left minimal
                break;
            default:
                done('Unexpected message');
        }
    }
    function parse(str, done) {
        try { return JSON.parse(str); }
        catch (err) { done(err); }
    }
    function openMessageCheck(obj, check /*, done */) {
        check('readyState', this.readyState).mustBe(1);
        check('path', obj.path).mustBe(this.path || (new URL(this.url)).pathname);
        check('sec-websocket-protocol', obj.headers?.['sec-websocket-protocol']).mustInclude(this.protocol);
        check('origin', obj.headers?.origin).mustBe(this.origin);

        this.send(Buffer.from('Hello'));
    }
    function binaryMessageCheck(data, check /*, done */) {
        check('data', Buffer.from(data) + '').mustBe('Hello');
        setTimeout(ws => ws.send('close'), 100, this);
    }
    function onPing(ev, check /*, done */) {
        check('readyState', this.readyState).mustBe(1);
        this.isPinged = true;
    }
    function onClose(ev, check, done) {
        check('readyState', this.readyState).mustBe(3);
        check('isOpened', this.isOpened).mustBe(true);
        if (this instanceof WebSocket) { check('isPinged', this.isPinged).mustBe(true); }
        check('code', ev.code).mustBe(1000);
        check('reason', ev.reason).mustBe('Normal closure.');
        done();
    }
});