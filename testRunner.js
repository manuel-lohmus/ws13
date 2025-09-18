// testRunner.js — universaalne, sõltumatu testimootor
/**  Copyright (c) Manuel Lõhmus (MIT License). */
"use strict";

const net = require('net'),
    { performance } = require('perf_hooks'),
    isWindows = process.platform === 'win32',
    controlServerSocketPath = isWindows
        ? '\\\\.\\pipe\\test-runner-lite.sock'
        : path.join(os.tmpdir(), 'test-runner-lite.sock'),
    args = parseArgs(process.argv.slice(2)),
    defaultOptions = {
        timeout: 3000,
        bail: false,
        json: false,
        raw: false,
        silent: false,
        workers: false,
        noExit: false,
        onComplete: null
    };

// CLI lipud
if ('help' in args) return printHelp();

if ('json' in args) process.env.TEST_JSON = 'true';
if (process.env.TEST_JSON === 'true') defaultOptions.json = true;

if ('raw' in args) process.env.TEST_RAW = 'true';
if (process.env.TEST_RAW === 'true') defaultOptions.raw = true;

if ('bail' in args) process.env.TEST_BAIL = 'true';
if (process.env.TEST_BAIL === 'true') defaultOptions.bail = true;

if ('silent' in args) process.env.TEST_SILENT = 'true';
if (process.env.TEST_SILENT === 'true') defaultOptions.silent = true;

if ('timeout' in args) process.env.TEST_TIMEOUT = String(args.timeout) || String(defaultOptions.timeout);
if (process.env.TEST_TIMEOUT) defaultOptions.timeout = parseInt(process.env.TEST_TIMEOUT, 10) || defaultOptions.timeout;

if ('testids' in args) process.env.TEST_TESTIDS = String(args.testids);
if (process.env.TEST_TESTIDS) defaultOptions.testIDs = String(process.env.TEST_TESTIDS).split(' ').filter(Boolean);

if ('workers' in args) process.env.TEST_WORKERS = 'true';
if (process.env.TEST_WORKERS === 'true') defaultOptions.workers = true;

module.exports = testRunner;

return;


function testRunner(runnerName, options, suite) {

    if (typeof options === 'function') { suite = options; options = {}; }
    options = Object.assign(defaultOptions, options || {});

    let numberOfTests = 0, ok = true, endTimer = null;
    const color = makeColors(process.stdout.isTTY && !options.raw),
        isPrimary = !process.send,
        primaryOnly = !options.workers,
        printToConsole = !options.silent && !options.json,
        startTime = performance.now(),
        tests = [],
        summary = {
            runner: runnerName,
            ok,
            total: 0,
            passed: 0,
            failed: 0,
            skipped: 0,
            turned_off: 0,
            time_ms: NaN,
            results: [],
        },
        controlServer = createControlServer(startTesting);

    // Is Worker
    if (!isPrimary) { startTesting(); }

    return;


    function startTesting() {

        // START print
        if (isPrimary) {
            if (printToConsole) console.log(`START > ${runnerName}`);
        }

        suite(testFn, isPrimary, !isPrimary);
        finish();
    }
    async function testFn(name, opts, fn) {

        if (!ok && options.bail) { return; }
        if (typeof opts === 'function') { fn = opts; opts = {}; }

        const test = {
            id: ++numberOfTests,
            name,
            status: 'OFF',
            time_ms: NaN,
        };

        if (!isPrimary) { test.worker_pid = process.pid; }

        if (opts.off || options.testIDs && !options.testIDs.includes(String(test.id))) {
            test.status = 'OFF';
            return setTimeout(finish, 1, test);
        }
        if (opts.skip) {
            test.status = 'SKIP'
            return setTimeout(finish, 1, test);
        }

        const { check, done } = makeCheckAndDone(test);
        test.startTime = performance.now();

        try {
            const maybePromise = fn(check, done, isPrimary);
            if (maybePromise && typeof maybePromise.then === 'function') {
                await maybePromise;
            }
        }
        catch (err) {
            done(err);
        }


        function makeCheckAndDone() {

            const done = makeDone();

            return { check, done };


            function check(label, value) {

                return {
                    mustBe(...args) {
                        if (!args.includes(value)) {
                            done(`${label} must be '${args}'`);
                        }

                        return this;
                    },
                    mustNotBe(...args) {
                        if (args.includes(value)) {
                            done(`${label} must not be '${args}'`);
                        }

                        return this;
                    },
                    mustInclude(v) {
                        if (!value?.includes || !value.includes(v)) {
                            done(`${label} must include '${v}'`);
                        }

                        return this;
                    },
                    truthy() {
                        if (!value) {
                            done(`${label} must be truthy`);
                        }

                        return this;
                    },
                    falsy() {
                        if (value) {
                            done(`${label} must be falsy`);
                        }

                        return this;
                    },
                    done
                };
            }
            function makeDone() {

                test.timer = setTimeout(function () { done('timeout') }, opts.timeout || options.timeout);

                return done;


                function done(err) {
                    // done called
                    if (!test.timer) return;

                    clearTimeout(test.timer);
                    delete test.timer;
                    test.time_ms = +(performance.now() - test.startTime).toFixed(2);
                    delete test.startTime;

                    test.status = err ? 'FAIL' : 'OK';

                    if (err) { ok = false; }

                    setTimeout(finish, 1, test, err);
                }
            }
        }
    }
    function finish(test, err) {

        // continue
        if (!test && numberOfTests) { return; }
        // add test
        if (test) {
            tests.push(test);

            // TEST print
            if (printToConsole && (primaryOnly && isPrimary || !primaryOnly)) {
                if (test.status !== 'OFF') {
                    const status = test.status === 'SKIP'
                        ? `${color.bgGray}  SKIP  ${color.reset}`
                        : test.status === 'OK'
                            ? `${color.bgGreen}   OK   ${color.reset}`
                            : `${color.bgRed} FAILED ${color.reset}`;

                    console.log(`${startLengthening(test.id, 3)}. ${primaryOnly ? '' : isPrimary ? 'p' : 'w'}TEST > ${endLengthening(test.name, 50)} ${startLengthening(test.time_ms, 8)}ms ${status} ${err ? '-> ' + err : ''}`);
                }
            }
        }
        // continue
        if (numberOfTests > tests.length) { return; }

        report(tests);
    }
    function report(results) {

        // Is Worker
        if (!isPrimary) { return workerEnd(); }

        for (let t of results) {

            summary.total++;
            if (t.status === 'OK') { summary.passed++; }
            if (t.status === 'FAIL') { summary.failed++; ok = false; }
            if (t.status === 'SKIP') { summary.skipped++; }
            if (t.status === 'OFF') { summary.turned_off++ }
            if (t.status !== 'OFF') { summary.results.push(t); }
        }

        // Only Primary Thread
        if (primaryOnly) { return end(); }
        // Timeout Exit
        if (endTimer === null) {
            process.on('beforeExit', function () { end(); });
        }
        clearTimeout(endTimer);
        endTimer = setTimeout(end, options.timeout);

        return;


        function workerEnd() {
            postMessageToPrimary({ type: 'tests-request', tests }, function () {
                process.exit(ok ? 0 : 1);
            });
        }
        function end() {

            // totalTime
            summary.time_ms = +(performance.now() - startTime).toFixed(2);

            // END print
            if (options.json) {
                console.log(JSON.stringify(summary, null, 2));
            }
            else if (printToConsole && isPrimary) {
                console.log(`END > ${runnerName}\t ${ok ? color.bgGreen + ' DONE ' + color.reset : color.bgRed + ' FAIL ' + color.reset}`);
            }

            // Integration
            if (typeof options.onComplete === 'function') { options.onComplete(summary); }

            if (controlServer) {
                controlServer.close(exit)
            }
            else { exit(); }


            function exit() {
                // Exit
                if (!options.noExit) process.exit(ok ? 0 : 1);
            }
        }
    }
    function createControlServer(callback) {
        if (!isPrimary) { return null; }

        const server = net.createServer(function (socket) {
            socket.on('data', function onMsg(msg) {
                msg = JSON.parse(msg.toString());

                if (msg.type === 'tests-request') {
                    report(msg.tests);
                }
            });
        });
        server.on('error', function (error) { console.error(error); });
        server.listen(controlServerSocketPath, callback);

        return server;
    }
    function postMessageToPrimary(msg, callback) {
        if (isPrimary) { return null; }

        const client = net.createConnection({ path: controlServerSocketPath }, function () {

            client.write(JSON.stringify(msg));
            client.end();
        });
        client.on('error', function (error) { console.error(error); });
        client.on('close', function () { if (typeof callback === 'function') { callback(); } });

        return client;
    }
    function makeColors(enable) {

        if (!enable) return new Proxy({}, { get: function () { return ''; } });

        return {
            reset: '\x1b[0m',
            bgGreen: '\x1b[7m\x1b[1m\x1b[32m',
            bgRed: '\x1b[7m\x1b[1m\x1b[31m',
            bgGray: '\x1b[7m\x1b[1m\x1b[90m',
        };
    }
    function startLengthening(str, toLength) {

        if (options.raw) { return str; }

        str = str + '';

        return ' '.repeat(toLength - str.length > 0 ? toLength - str.length : 0) + str;
    }
    function endLengthening(str, toLength) {

        if (options.raw) { return str; }

        str = str + '';

        return str + ' '.repeat(toLength - str.length > 0 ? toLength - str.length : 0);
    }
}
function parseArgs(argv) {

    let key, out = {};

    for (const token of argv) {
        if (token.startsWith('-')) {
            const [k, v] = token.split('=');
            key = k.replace(/^-+/, '').toLowerCase();
            out[key] = v ?? true;
        } else if (key) {
            out[key] = typeof out[key] === 'string' ? out[key] + ' ' + token : token;
        }
    }

    return out;
}
function printHelp() {

    console.log(`
Usage:
  node your.test.js [--testIDs=1 2 ...] [--timeout=ms] [--bail] [--json] [--raw] [--silent] [--help]

  Options:
    --help            Show this help    
    --testIDs         Space-separated list of test IDs to run (e.g. --testIDs=1 3 5)
    --timeout         Default timeout for tests in milliseconds (default: 3000)
    --bail            Stop on first failure
    --json            Output machine-readable JSON summary
    --raw             Disable colors and formatting
    --silent          Suppress human-readable logs (useful when sending JSON via IPC)
    --workers         Run tests in both primary and worker processes
    `.trim());

    process.exit(0);
}