
/**  Copyright (c) 2024, Manuel Lõhmus (MIT License). */

(function tests() {

    var http = require('node:http'),
        WebSocket = require('./index'),
        port = process.env.PORT || 3000;

    testRunner("WS - Tests            ", { skip: false }, (test) => {
        test("ws13 > Server           ", { skip: false, timeout: 15000 }, (check, done) => {

            var server = new http.createServer(),
                wsList = [];

            server.on('error', done);
            server.listen(port, 'localhost');
            server.on('upgrade', function upgrade(request) {

                var ws = WebSocket({
                    request,
                    protocol: 'test',
                    origin: 'http://localhost:' + port,
                    //extension: null, /*Default `permessage-deflate`.*/
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
                    });
                    ws.on('message', function (ev) {

                        if (ev.data === 'close') {

                            return ws.close(1000, 'Normal closure.');
                        }

                        if (ev.isBinary) {

                            ws.send(ev.data);
                        }
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

                        wsList = wsList.filter(ws => ws !== ws);
                        check(ws.isOpened).mustBe(true);
                        check(ws.isPonged).mustBe(true);
                        check(ev.code).mustBe(1000);
                        check(ev.reason).mustBe('Normal closure.');
                        setTimeout(closeServer);
                    });
                }

                else { request.socket.end(); }
            });
            server.on('close', done);


            function closeServer() { if (!wsList.length) { server.close(); } }
        });
        test("ws13 > WebSocket        ", { skip: false, timeout: 15000 }, (check, done) => {

            var ws = new WebSocket({
                request: http.request({ hostname: 'localhost', port, path: '/test' }),
                protocol: 'test',
                origin: 'http://localhost',
                //extension: null, /*Default `permessage-deflate`.*/
            });
            ws.on('error', done);
            ws.on('open', function (ev) { onOpen.call(this, ev, check, done); });
            ws.on('message', function (ev) { onMessage.call(this, ev, check, done); });
            ws.on('ping', function (ev) { onPing.call(this, ev, check, done); });
            ws.on('close', function (ev) { onClose.call(this, ev, check, done); });

            check(ws.readyState).mustBe(0);
        });
        test("ws13 > WebSocket > close", { skip: false, timeout: 15000 }, (check, done) => {

            var ws = new WebSocket({
                request: http.request({ hostname: 'localhost', port, path: '/test' }),
                protocol: 'test',
                origin: 'http://localhost',
                //extension: null, /*Default `permessage-deflate`.*/
            });
            ws.on('error', done);
            ws.on('open', function (ev) { onOpen.call(this, ev, check, done); });
            ws.on('message', function (ev) {

                setTimeout(function () {

                    ws.close(1000, 'Normal closure.');
                    check(ws.readyState).mustBe(2);

                }, 100);
            });
            ws.on('ping', function (ev) { onPing.call(this, ev, check, done); });
            ws.on('close', function (ev) { onClose.call(this, ev, check, done); });

            check(ws.readyState).mustBe(0);
        });
        test("http > WebSocket        ", { skip: http.WebSocket === undefined, timeout: 15000 }, (check, done) => {

            var ws = new http.WebSocket(`ws://localhost:${port}/test`, 'test');
            ws.binaryType = "arraybuffer";
            ws.onerror = function (ev) { done(ev.message); };
            ws.onopen = function (ev) { onOpen.call(this, ev, check, done); };
            ws.onmessage = function (ev) { onMessage.call(this, ev, check, done); };
            ws.onclose = function (ev) { onClose.call(this, ev, check, done); };

            check(ws.readyState).mustBe(0);
        });
        test("http > WebSocket > close", { skip: http.WebSocket === undefined, timeout: 15000 }, (check, done) => {

            var ws = new http.WebSocket(`ws://localhost:${port}/test`, 'test');
            ws.binaryType = "arraybuffer";
            ws.onerror = function (ev) { done(ev.message); };
            ws.onopen = function (ev) { onOpen.call(this, ev, check, done); };
            ws.onmessage = function (ev) {

                setTimeout(function () {

                    ws.close(1000, 'Normal closure.');
                    check(ws.readyState).mustBe(2);

                }, 100);
            };
            ws.onclose = function (ev) { onClose.call(this, ev, check, done); };

            check(ws.readyState).mustBe(0);
        });


        function onOpen(ev, check, done) {

            check(this.readyState).mustBe(1);
            this.isOpened = true;
        }
        function onMessage(ev, check, done) {

            if (ev.isBinary || ev.data instanceof ArrayBuffer) {

                binaryMessageCheck.call(this, ev.data, check, done)
            }

            else {

                var obj = parse(ev.data, done);

                switch (obj.status) {

                    case 'isOpen':
                        openMessageCheck.call(this, obj, check, done);
                        break;

                    case 'isEcho':
                        echoMessageCheck.call(this, obj, check, done);
                        break;

                    default: done('Unexpected message')
                }
            }
        }
        function parse(str, done) {

            try { return JSON.parse(str); }
            catch (err) { done(err); }
        }
        function openMessageCheck(obj, check, done) {

            check(this.readyState).mustBe(1);
            check(obj.path).mustBe(this.path || (new URL(this.url)).pathname);
            check(obj.headers?.['sec-websocket-protocol']).mustBe(this.protocol);
            check(obj.headers?.origin).mustBe(this.origin);

            this.send(Buffer.from('Hello'));
        }
        function echoMessageCheck(obj, check, done) {

        }
        function binaryMessageCheck(data, check, done) {

            check(Buffer.from(data) + '').mustBe('Hello');

            setTimeout(function (ws) {

                ws.send('close');
            }, 100, this);
        }
        function onPing(ev, check, done) {

            check(this.readyState).mustBe(1);
            this.isPinged = true;
        }
        function onClose(ev, check, done) {

            check(this.readyState).mustBe(3);
            check(this.isOpened).mustBe(true);
            if (this instanceof WebSocket) { check(this.isPinged).mustBe(true); }
            check(ev.code).mustBe(1000);
            check(ev.reason).mustBe('Normal closure.');
            done();
        }
    });

})();


// testRunner function for Node.js - v1.0.0
function testRunner(runnerName, options, cb) {

    process.on('uncaughtException', function (err) { });

    var stdout = {},
        timeouts = {},
        countStarted = 0,
        countCompleted = 0,
        testsStarted = false,
        testRunnerOK = true,
        strSKIP = "\t\t[\x1b[100m\x1b[97m  SKIP  \x1b[0m]",
        strTestsERR = "[\x1b[41m\x1b[97m The tests failed! \x1b[0m]",
        strTestsDONE = "[\x1b[42m\x1b[97m The tests are done! \x1b[0m]";

    //skip
    if (options?.skip) {

        testsStarted = "SKIP";
        if (runnerName) { log(0, "SKIP  > ", runnerName, strSKIP); }
        testCompleted();

        return testRunnerOK;
    }


    if (runnerName) { log(0, "START > ", runnerName); }
    cb(test);
    testsStarted = true;
    testCompleted();

    return testRunnerOK;

    function log() {

        var line = "";

        for (let i = 1; i < arguments.length; i++) {

            line += arguments[i];
        }

        if (stdout[arguments[0]]) {

            stdout[arguments[0]] += line + "\n";
        }
        else {

            stdout[arguments[0]] = line + "\n";
        }
    }
    function print_stdout() {

        console.log();
        console.log(
            Object.keys(stdout).reduce((output, value, i) => output += stdout[i], '')
        );
    }
    function test(testName, options, fn) {

        var startTime, endTime,
            id = ++countStarted,
            testOK = true,
            label = "  " + id + ".\tTEST > " + testName + "\t",
            strOK = "\t[\x1b[42m\x1b[97m   OK   \x1b[0m]",
            strERR = "\t[\x1b[41m\x1b[97m FAILED \x1b[0m] -> ";

        //skip
        if (options?.skip) {

            log(id, label, "\t", strSKIP);
            testCompleted();

            return;
        }
        //timeout 
        timeouts[id] = setTimeout(function () {
            done("timeout");
        }, options?.timeout || 3000);

        startTime = performance.now();

        try {
            if (fn(check, done)) { done(); }

        }
        catch (err) { done(err); }

        function done(err = '') {

            endTime = performance.now();
            if (err) { testRunnerOK = testOK = false; }
            if (err || testOK) 
            log(id, label, ": ", (endTime - startTime).toFixed(2), "ms\t", err ? strERR : strOK, err || "");
            if (timeouts[id]) { testCompleted(); }
            clearTimeout(timeouts[id]);
            delete timeouts[id];
        }
        function check(value) {

            return {
                mustBe: function mustBe(mustBe) {
                    if (value !== mustBe) { done("\x1b[44m\x1b[97m returned \x1b[0m '" + value + "'\t  \x1b[44m\x1b[97m must be \x1b[0m '" + mustBe + "'"); }
                    return this;
                },
                mustNotBe: function mustNotBe(mustNotBe) {
                    if (value === mustNotBe) { done("\x1b[44m\x1b[97m returned \x1b[0m '" + value + "'\t  \x1b[44m\x1b[97m must not be \x1b[0m '" + mustNotBe + "'"); }
                    return this;
                },
                done
            };
        }
    }
    function testCompleted() {

        countCompleted++;

        if (!testsStarted || countStarted >= countCompleted) { return; }

        if (runnerName) {

            if (testsStarted === "SKIP") {

                print_stdout();
            }
            else if (!testRunnerOK) {
                log(++countStarted, "END   > " + runnerName + "\t" + strTestsERR);
                print_stdout();
            }
            else {
                log(++countStarted, "END   > ", runnerName, "\t", strTestsDONE);
                print_stdout();
            }

            process.removeAllListeners('uncaughtException');

            if (process.argv[1].endsWith(".js")) {

                process.stdin.setRawMode(true);
                process.stdin.resume();
                process.stdin.on('data', process.exit.bind(process, testRunnerOK ? 0 : 1));

                console.log('Press any key to exit');
            }
            else {

                process.exit(testRunnerOK ? 0 : 1);
            }
        }
    }
}