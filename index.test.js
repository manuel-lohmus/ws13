/**  Copyright (c) 2024, Manuel Lõhmus (MIT License). */

var http = require('node:http'),
    WebSocket = require('./index'),
    port = process.env.PORT || 3000;

testRunner("WS - Tests            ", { skip: false }, (test) => {
    test("ws13 > Server           ", { skip: false, timeout: 15000 }, (check, done) => {

        var server = http.createServer(),
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
                    check('isOpened', ws.isOpened).mustBe(true);
                    check('isPonged', ws.isPonged).mustBe(true);
                    check('code', ev.code).mustBe(1000);
                    check('reason', ev.reason).mustBe('Normal closure.');
                    setTimeout(closeServer);
                });
            }

            else { request.socket.end(); }
        });
        server.on('close', done);


        function closeServer() { if (!wsList.length) { server.close(); } }
    });
    test("ws13 > WebSocket        ", { skip: false, timeout: 15000 }, (check, done) => {

        var ws = WebSocket({
            request: http.request({ hostname: 'localhost', port, path: '/test' }),
            protocol: 'chat, test',
            origin: 'http://localhost',
            //extension: null, /*Default `permessage-deflate`.*/
        });
        ws.on('error', done);
        ws.on('open', function (ev) { onOpen.call(this, ev, check, done); });
        ws.on('message', function (ev) { onMessage.call(this, ev, check, done); });
        ws.on('ping', function (ev) { onPing.call(this, ev, check, done); });
        ws.on('close', function (ev) { onClose.call(this, ev, check, done); });

        check('readyState', ws.readyState).mustBe(0);
    });
    test("ws13 > WebSocket > close", { skip: false, timeout: 15000 }, (check, done) => {

        var ws = WebSocket({
            request: http.request({ hostname: 'localhost', port, path: '/test' }),
            protocol: 'chat, test',
            origin: 'http://localhost',
            //extension: null, /*Default `permessage-deflate`.*/
        });
        ws.on('error', done);
        ws.on('open', function (ev) { onOpen.call(this, ev, check, done); });
        ws.on('message', function (ev) {

            setTimeout(function () {

                ws.close(1000, 'Normal closure.');
                check('readyState', ws.readyState).mustBe(2);

            }, 100);
        });
        ws.on('ping', function (ev) { onPing.call(this, ev, check, done); });
        ws.on('close', function (ev) { onClose.call(this, ev, check, done); });

        check('readyState', ws.readyState).mustBe(0);
    });
    test("http > WebSocket        ", { skip: http.WebSocket === undefined, timeout: 15000 }, (check, done) => {

        var ws = new http.WebSocket(`ws://localhost:${port}/test`, ['chat', 'test']);
        ws.binaryType = "arraybuffer";
        ws.onerror = function (ev) { done(ev.message); };
        ws.onopen = function (ev) { onOpen.call(this, ev, check, done); };
        ws.onmessage = function (ev) { onMessage.call(this, ev, check, done); };
        ws.onclose = function (ev) { onClose.call(this, ev, check, done); };

        check('readyState', ws.readyState).mustBe(0);
    });
    test("http > WebSocket > close", { skip: http.WebSocket === undefined, timeout: 15000 }, (check, done) => {

        var ws = new http.WebSocket(`ws://localhost:${port}/test`, ['chat', 'test']);
        ws.binaryType = "arraybuffer";
        ws.onerror = function (ev) { done(ev.message); };
        ws.onopen = function (ev) { onOpen.call(this, ev, check, done); };
        ws.onmessage = function (ev) {

            setTimeout(function () {

                ws.close(1000, 'Normal closure.');
                check('readyState', ws.readyState).mustBe(2);

            }, 100);
        };
        ws.onclose = function (ev) { onClose.call(this, ev, check, done); };

        check('readyState', ws.readyState).mustBe(0);
    });


    function onOpen(ev, check, done) {

        check('readyState', this.readyState).mustBe(1);
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

        check('readyState', this.readyState).mustBe(1);
        check('path', obj.path).mustBe(this.path || (new URL(this.url)).pathname);
        check('sec-websocket-protocol', obj.headers?.['sec-websocket-protocol']).mustInclude(this.protocol);
        check('origin', obj.headers?.origin).mustBe(this.origin);

        this.send(Buffer.from('Hello'));
    }
    function echoMessageCheck(obj, check, done) {

    }
    function binaryMessageCheck(data, check, done) {

        check('data', Buffer.from(data) + '').mustBe('Hello');

        setTimeout(function (ws) {

            ws.send('close');
        }, 100, this);
    }
    function onPing(ev, check, done) {

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


/**
 * Test runner. Function to run unit tests in the console.
 * @author Manuel Lõhmus 2024 (MIT License)
 * @version 1.1.0
 * [2024-12-29] adde    d functionality to select tests by ID in the command line arguments (e.g. --testID=1 2 3)
 * @example `npm test '--'` or `node index.test.js`
 * @example `npm test '--' --help` or `node index.test.js --help`
 * @example `npm test '--' --testIDs=1 2 3` or `node index.test.js --testIDs=1 2 3`
 * @param {string} runnerName Test runner name.
 * @param {{skip:boolean}} options Test runner options.
 * @param {(test:Test)=>void} cb Callback function to run the unit tests.
 * @returns {boolean} If the tests are OK
 * @example testRunner('Module name', { skip: false },  function (test) {...});
 * 
 * @callback Test Unit test callback function
 * @param {string} testName Test name.
 * @param {{skip:boolean,timeout:number}} options Test options. (default: {skip:false,timeout:3000})))
 * @param {(check:Check,done:Done)=>void} fn Test function. Function parameters: check, done. `check` is used to check the test result. `done` is used to end the test.
 * @returns {void}
 * @example test("Test name", {skip:false,timeout:3000}, function(check,done){...});
 * @example test("Test name", function(check,done){...});
 * @example test("Test name", {skip:checkableObject === undefined}, function(check,done){...});
 * 
 * @callback Check Check function to check the test result.
 * @param {string} label Value name.
 * @param {any} value Value to check.
 * @returns {Validator} 
 * @example check('name', value).mustBe(true);
 * @example check('name', value).mustNotBe(false);
 * @example check('name', value).mustBe(true).done();
 * @example check('name', value).mustBe(true).mustNotBe(false).done();
 * 
 * @callback Done Callback function to end the test.
 * @param {Error} err Error message. If the error message is empty, the test is considered successful.
 * @returns {void}
 * 
 * @typedef Validator
 * @property {(value:any)=>Validator} mustBe Check if the value is equal to the specified value.
 * @property {(value:any)=>Validator} mustNotBe Check if the value is not equal to the specified value.
 * @property {(value:any)=>Validator} mustInclude Check if the value is included to the specified value.
 * @property {Done} done Callback function to end the test.
 */
function testRunner(runnerName, options, cb) {

    process.on('uncaughtException', function noop() { });

    var stdout = {},
        timeouts = {},
        countStarted = 0,
        countCompleted = 0,
        testsStarted = false,
        testRunnerOK = true,
        strSKIP = "\t\t[\x1b[100m\x1b[97m  SKIP  \x1b[0m]",
        strTestsERR = "[\x1b[41m\x1b[97m The tests failed! \x1b[0m]",
        strTestsDONE = "[\x1b[42m\x1b[97m The tests are done! \x1b[0m]",
        { help, testids } = _arg_options();

    if (help || help === '') {

        console.log(`
npm test '--' [OPTION1=VALUE1] [OPTION2=VALUE2] ...
or
node index.test.js [OPTION1=VALUE1] [OPTION2=VALUE2] ...

The following options are supported:
    --help      Display this help
    --testID    Number of the test to run
    `);

        if (process.argv[1].endsWith(".js")) { exitPressKey(); }

        return;
    }

    if (testids) { testids = testids.split(' ').filter((id) => id); }

    //skip all tests
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
    /**
     * Unit test function.
     * @type {Test} 
     */
    function test(testName, options, fn) {

        var startTime, endTime,
            id = ++countStarted,
            testOK = true,
            label = "  " + id + ".\tTEST > " + testName + "\t",
            strOK = "\t[\x1b[42m\x1b[97m   OK   \x1b[0m]",
            strERR = "\t[\x1b[41m\x1b[97m FAILED \x1b[0m] -> ";

        //skip
        if (options?.skip || testids && !testids.includes(id + '')) {

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

        /**
         *  Callback function to end the test.
         * @type {Done}
         */
        function done(err = '') {

            endTime = performance.now();
            if (err) { testRunnerOK = testOK = false; }
            if (err || testOK)
                log(id, label, ": ", (endTime - startTime).toFixed(2), "ms\t", err ? strERR : strOK, err || "");
            if (timeouts[id]) { testCompleted(); }
            clearTimeout(timeouts[id]);
            delete timeouts[id];
        }
        /**
         * Check function to check the test result.
         * @type {Check}
         */
        function check(label = 'returned', value) {

            /**
             * Selection fuctions to check.
             * @type {Validator}
             */
            return {
                mustBe: function mustBe(mustBe) {
                    if (value !== mustBe) { done("\x1b[44m\x1b[97m " + label + " \x1b[0m '" + value + "' \x1b[44m\x1b[97m must be \x1b[0m '" + mustBe + "'"); }
                    return this;
                },
                mustNotBe: function mustNotBe(mustNotBe) {
                    if (value === mustNotBe) { done("\x1b[44m\x1b[97m " + label + " \x1b[0m '" + value + "' \x1b[44m\x1b[97m must not be \x1b[0m '" + mustNotBe + "'"); }
                    return this;
                },
                mustInclude: function mustInclude(mustInclude) {
                    if (!value?.includes || !value.includes(mustInclude)) { done("\x1b[44m\x1b[97m " + label + " \x1b[0m '" + value + "' \x1b[44m\x1b[97m must include \x1b[0m '" + mustInclude + "'"); }
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

                exitPressKey();
            }
            else {

                process.exit(testRunnerOK ? 0 : 1);
            }
        }
    }

    function exitPressKey() {

        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on('data', process.exit.bind(process, testRunnerOK ? 0 : 1));

        console.log('Press any key to exit');
    }

    function _arg_options() {

        var key;

        return process.argv.slice(2).reduce(function (opt, keyVal) {

            var [_key, _val] = keyVal.split('=');

            _key = (_key + '').trim();

            if (_key[0] === '-') {

                if (_val === undefined) {

                    key = _trimKey(_key);
                    opt[key] = true;

                    return opt;
                }

                _val = (_val + '').trim();
                opt[_trimKey(_key)] = _val;
            }
            else if (_key) {

                opt[key] = typeof opt[key] === 'string' ? opt[key] + ' ' + _key : _key;
            }

            return opt;

            function _trimKey(key) {

                if (key[0] === '-') { key = key.slice(1); }
                if (key[0] === '-') { key = key.slice(1); }

                return key.toLowerCase();
            }
        }, {});
    }
}