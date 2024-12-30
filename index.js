/**  Copyright (c) 2024, Manuel Lõhmus (MIT License). */

// WebSocket 

var { Buffer } = require('node:buffer'),
    crypto = require('node:crypto'),
    EventEmitter = require('node:events'),
    { Socket } = require('node:net'),
    http = require('node:http'),
    createPermessageDeflate = require('./permessage-deflate');

/**
 * @typedef Options for WebSocket
 * @property {boolean} isDebug If set to true, more info in console. Default false
 * @property {http.IncomingMessage|http.ClientRequest} request Reference link: https://nodejs.org/docs/latest/api/http.html#class-httpincomingmessage or https://nodejs.org/docs/latest/api/http.html#class-httpclientrequest
 * @property {object} headers Key-value pairs of header names and values. Header names are lower-cased.
 * @property {net.Socket} socket This class is an abstraction of a TCP socket or a streaming IPC endpoint.
 * @property {string} protocol The sub-protocol selected by the server. Default empty string.
 * @property {string} origin String. Default empty string.
 * @property {number} heartbeatInterval_ms The interval after which ping pong takes place. Default on the client side 0ms and on the server side 30000ms.
 * @property {Extension|null} extension The extensions selected by the server. Default 'permessage-deflate'
 */

/**
 * @typedef Extension for WebSocket
 * @property {(ws:WebSocket)=>void} init
 * @property {(headers:object, cb:(err:Error, isActivate:boolean)=>void)=>void} activate
 * @property {(cb:(err:Error, extensionHeaderValue:string)=>void)=>void} generateOffer
 * @property {(headers:object, cb:(err:Error, extensionHeaderValue:string)=>void)=>void} generateResponse
 * @property {(frame:Frame, cb:(err:Error, frame:Frame)=>void)=>void} mask
 * @property {(frame:Frame, cb:(err:Error, frame:Frame)=>void)=>void} unmask
 * @property {(frame:Frame, cb:(err:Error, frame:Frame)=>void)=>void} processOutgoingFrame
 * @property {(frame:Frame, cb:(err:Error, frame:Frame)=>void)=>void} processIncomingFrame
 * @property {(message:Message, cb:(err:Error, message:Message)=>void)=>void} processOutgoingMessage
 * @property {(message:Message, cb:(err:Error, message:Message)=>void)=>void} processIncomingMessage
 * @property {(cb:(err:Error)=>void)=>void} close
 */

/**
 * @typedef Frame for WebSocket
 * @property {boolean} isFin
 * @property {boolean} isRsv1
 * @property {boolean} isRsv2
 * @property {boolean} isRsv3
 * @property {boolean} opcode
 * @property {boolean} isMasked
 * @property {number} payloadLength
 * @property {[]|null} maskingKey
 * @property {Buffer|null} payload
 */

/**
 * @typedef WebSocket WebSocket is a communication protocol that makes it possible to establish a two-way communication channel between a server and a client.
 * @property {0} CONNECTING The connection is not yet open.
 * @property {1} OPEN The connection is open and ready to communicate.
 * @property {2} CLOSING The connection is in the process of closing.
 * @property {3} CLOSED The connection is closed.
 * @property {(event)=>void} onopen Fired when a connection with a WebSocket is opened. Also available via the onopen property.
 * @property {(event)=>void} onmessage Fired when data is received through a WebSocket. Also available via the onmessage property.
 * @property {(event)=>void} onping
 * @property {(event)=>void} onpong
 * @property {(event)=>void} onclose Fired when a connection with a WebSocket is closed. Also available via the onclose property
 * @property {(event)=>void} onerror Fired when data is received through a WebSocket. Also available via the onmessage property.
 * @property {string} protocol The protocol accepted by the server, or an empty string if the client did not specify protocols in the WebSocket constructor.
 * @property {0|1|2|3} readyState The connection state.
 * @property {string} path
 * @property {string} url
 * @property {string} origin
 * @property {number} heartbeatInterval_ms
 * @property {string} ip IP address
 * @property {number} port
 * @property {number} latency_ms Latency describes the amount of delay on a network or Internet connection. Low latency implies that there are no or almost no delays. High latency implies that there are many delays. One of the main aims of improving performance is to reduce latency.
 * @property {()=>void} close Closes the connection.
 * @property {(callback:(latency_ms:number)=>void)=>void} heartbeat Initiates a ping-pong procedure by measuring its time.
 * @property {(data)=>void} send Send `data` through the connection. 
 * @property {(data)=>void} sendPing Send Ping through the connection.
 * @property {(data)=>void} sendPong Send Pong through the connection.
 */

/**
 * WebSocet constructor function.
 * @param {Options} options
 * @returns {WebSocket}
 */
function createWebSocket({
    isDebug = false, // If set to true, more info in console. Default false
    request, // Reference link: https://nodejs.org/docs/latest/api/http.html#class-httpincomingmessage or https://nodejs.org/docs/latest/api/http.html#class-httpclientrequest
    headers, // Key-value pairs of header names and values. Header names are lower-cased.
    socket, // This class is an abstraction of a TCP socket or a streaming IPC endpoint.
    protocol = '', // The sub-protocol selected by the server. Default empty string.
    origin = '', // String. Default empty string.
    heartbeatInterval_ms = 0, // The interval after which ping pong takes place. Default on the client side 0ms and on the server side 30000ms.
    extension = createPermessageDeflate() // The extensions selected by the server. Default 'permessage-deflate'
} = {}) {

    if (createWebSocket === this.constructor) { throw new Error('This function must be used without the `new` keyword.'); }

    if (!isRoleOfServer() && !(request instanceof http.ClientRequest)) { return null; }


    var ws = new EventEmitter(),
        readyState = 0,
        heartbeatTimeout,
        latency_ms = 0,
        pingStartTime = 0,
        wasCleanClose = false,
        inChunks = [],
        inChunk = null,
        inOffset = 0,
        inFrame = null,
        inFrames = [];


    Object.defineProperties(ws, {

        // CONSTANTS
        CONNECTING: { value: 0, writable: false, configurable: false, enumerable: false },
        OPEN: { value: 1, writable: false, configurable: false, enumerable: false },
        CLOSING: { value: 2, writable: false, configurable: false, enumerable: false },
        CLOSED: { value: 3, writable: false, configurable: false, enumerable: false },

        // EVENTS
        onopen: { value: null, writable: true, configurable: false, enumerable: false },
        onmessage: { value: null, writable: true, configurable: false, enumerable: false },
        onping: { value: null, writable: true, configurable: false, enumerable: false },
        onpong: { value: null, writable: true, configurable: false, enumerable: false },
        onclose: { value: null, writable: true, configurable: false, enumerable: false },
        onerror: { value: null, writable: true, configurable: false, enumerable: false },

        // METHODS,
        close: { value: close, writable: false, configurable: false, enumerable: false },
        heartbeat: { value: heartbeat, writable: false, configurable: false, enumerable: false },
        send: { value: sendData, writable: false, configurable: false, enumerable: false },
        sendPing: { value: sendPing, writable: false, configurable: false, enumerable: false },
        sendPong: { value: sendPong, writable: false, configurable: false, enumerable: false },

        // ATTRIBUTES
        protocol: { value: protocol, writable: true, configurable: false, enumerable: false },
        path: { value: request?.url || request.path, writable: false, configurable: false, enumerable: false },
        url: { value: request?.url || request.path, writable: false, configurable: false, enumerable: false },
        origin: { value: origin, writable: true, configurable: false, enumerable: false },
        heartbeatInterval_ms: {
            get() { return heartbeatInterval_ms; },
            set(val) { if (typeof val === 'number') { heartbeatInterval_ms = val; } },
            configurable: false,
            enumerable: false
        },
        readyState: { get() { return readyState; }, configurable: false, enumerable: false },

        ip: { get() { return headers?.['x-forwarded-for'] || socket?.remoteAddress || '' }, configurable: false, enumerable: false },
        port: { get() { return socket?.remotePort || '' }, configurable: false, enumerable: false },
        latency_ms: { get() { return latency_ms }, configurable: false, enumerable: false },
    });

    ws.on('open', function (event) { if (typeof ws.onopen === 'function') { ws.onopen.call(ws, event); } });
    ws.on('message', function (event) { if (typeof ws.onmessage === 'function') { ws.onmessage.call(ws, event); } });
    ws.on('ping', function (event) { if (typeof ws.onmessage === 'function') { ws.onping.call(ws, event); } });
    ws.on('pong', function (event) { if (typeof ws.onmessage === 'function') { ws.onpong.call(ws, event); } });
    ws.on('close', function (event) { if (typeof ws.onclose === 'function') { ws.onclose.call(ws, event); } });
    ws.on('error', function (event) { if (typeof ws.onerror === 'function') { ws.onerror.call(ws, event); } });

    if (typeof extension?.init === 'function') { extension.init(ws); }


    if (request instanceof http.ClientRequest) {
        // Role Of Client
        Promise.resolve(1).then(connect);
    }
    else {
        // Role Of Server
        socket.on('error', errorHandling);
        socket.on('end', endHandling);
        socket.on('data', incomingData);
        Promise.resolve(1).then(sendHandshakeResponse);
        heartbeatTimeout = setTimeout(heartbeat);
    }

    return ws;


    function connect() {

        var key = generateKey(),
            accept = generateAccept(key);

        //set headers
        request.setHeader('Cache-Control', 'no-cache');
        request.setHeader('Connection', 'Upgrade');
        request.setHeader('Upgrade', 'WebSocket');
        request.setHeader('Sec-WebSocket-Key', key);
        request.setHeader('Sec-WebSocket-Version', '13');
        if (protocol) { request.setHeader('Sec-WebSocket-Protocol', protocol?.join?.(", ") || protocol); }
        if (origin) { request.setHeader('Origin', origin); }

        socket = request.socket;
        socket.once('ready', function () {

            pDebug("The client's handshake`request` has been sent.");
        });

        request.on('upgrade', function (response) {

            var err = validateHandshake(response.headers);

            if (err) { return destroy(err); }

            if (response?.headers?.["sec-websocket-extensions"]) {

                if (typeof extension?.activate === 'function') {

                    extension.activate(response.headers, function (err, isActivate) {

                        if (err) { return destroy(err); }

                        isActivate ? open() : destroy('Unsupported websocket extension.');
                    });
                }

                else { destroy('Unsupported websocket extension.'); }
            }

            else { open(); }

            function open() {

                socket.on('error', errorHandling);
                socket.on('end', endHandling);
                socket.on('data', incomingData);

                readyState = ws.OPEN;
                ws.emit('open');
                heartbeatTimeout = setTimeout(heartbeat);
                pDebug('The client handshake is "Accepted".');
            }
            function destroy(err) {

                ws.emit('error', err);
                request.destroy(err);
            }
        });
        request.on('error', function (err) {

            if (err.code === 'ECONNRESET') {

                return unsupported();
            }

            ws.emit('error', err);
        });
        request.on('response', function (response) { unsupported(); });

        if (typeof extension?.generateOffer === 'function') {

            extension.generateOffer(function (err, extensionHeaderValue) {

                if (err) {

                    ws.emit('error', err);
                    request.destroy(err);

                    return;
                }

                request.setHeader('Sec-Websocket-Extensions', extensionHeaderValue);
                request.end();
            });
        }
        else { request.end(); }

        function unsupported() {

            ws.emit('error', 'Unsupported websocket');
            pError('Unsupported websocket');
        }
        function validateHandshake(headers) {

            if (headers['connection'].toLowerCase() !== 'upgrade') { return 'Invalid `Connection` header'; }
            if (headers['upgrade'].toLowerCase() !== 'websocket') { return 'Invalid `Upgrade` header'; }
            if (headers['sec-websocket-accept'] !== accept) { return 'Invalid `Sec-WebSocket-Accept` header'; }
            if (protocol && !protocol.includes(headers['sec-websocket-protocol'])) { return 'Server sent a subprotocol but none was requested'; }
            //headers['sec-websocket-extensions']

            return null;
        }
    }
    function generateKey() { return crypto.randomBytes(16).toString('base64'); }
    function generateAccept(key) {

        return crypto.createHash('sha1')
            .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
            .digest('base64');
    }
    function isRoleOfServer() {

        if (!socket && request?.socket) { socket = request.socket; }
        if (!socket instanceof Socket) { return false; }
        if (!headers && request?.headers) { headers = request.headers; }
        if (!socket
            || headers?.["sec-websocket-version"] !== '13'
            || !headers?.["sec-websocket-key"]) { return false; }
        // TODO > protocol accept > Done
        if (protocol && headers && headers?.["sec-websocket-protocol"] !== protocol) {

            var offerProtocols = headers?.["sec-websocket-protocol"].split(',')
                .map(entry => (entry + '').trim().toLowerCase()),
                supportedProtocols = Array.isArray(protocol)
                    ? protocol
                    : (protocol + '').split(',')
                        .map(entry => (entry + '').trim().toLowerCase()),
                selected = offerProtocols.find(entry => supportedProtocols.includes(entry)) || '';

            if (!selected && protocol) { return false; }

            protocol = selected;
        }
        if (origin && request?.headers?.origin !== origin) {

            if (origin.indexOf(request?.headers?.host) === -1) {

                return false;
            }
        }

        if (heartbeatInterval_ms === 0) { heartbeatInterval_ms = 30000; }

        return true;
    }
    function sendHandshakeResponse() {

        if (!headers) { throw new Error('Header entries are required'); }

        var _headers = [
            'HTTP/1.1 101 Switching Protocols',
            'Connection: Upgrade',
            'Upgrade: WebSocket'
        ];

        if (protocol) { _headers.push(`Sec-WebSocket-Protocol: ${protocol}`); }

        // Accept
        var key = headers["sec-websocket-key"];
        _headers.push(`Sec-WebSocket-Accept: ${generateAccept(key)}`);

        if (headers?.["sec-websocket-extensions"]
            && typeof extension?.generateResponse === 'function') {

            extension.generateResponse(headers, function (err, extensionHeaderValue) {

                if (err) {

                    ws.emit('error', err);
                    ws.close(1010, err);

                    return;
                }

                if (typeof extensionHeaderValue === 'string') { _headers.push('Sec-Websocket-Extensions: ' + extensionHeaderValue); }

                send();
            });
        }
        else {
            extension = null;
            send();
        }


        function send() {

            socket.write(_headers.concat('\r\n').join('\r\n'), function () {

                readyState = ws.OPEN;
                ws.emit('open');

                pDebug('The server handshake `response` has been sent.');
            });
        }
    }
    function errorHandling(err) { pError(err); }
    function incomingData(buf) {

        heartbeat();
        inChunks.push(buf);
        readInput();
    }
    function endHandling() {

        readyState = ws.CLOSED;

        if (!wasCleanClose) {

            close(1006, 'Connection closed abnormally (closing handshake did not occur).');
        }

        if (typeof ws.end === 'function') {

            clearTimeout(close.timeout);
            ws.end();
        }
    }
    function heartbeat(callback) {

        if (!heartbeat.callbacks) { heartbeat.callbacks = []; }

        if (heartbeat.callbacks.length && latency_ms) {

            heartbeat.callbacks.forEach(function (cb) { cb(latency_ms); });
            heartbeat.callbacks = [];
        }

        if (typeof callback === 'function') {

            heartbeat.callbacks.push(callback);
            latency_ms = 0;
            Promise.resolve(1).then(check);

            return;
        }

        clearTimeout(heartbeatTimeout);

        if (heartbeatInterval_ms > 0) {

            heartbeatTimeout = setTimeout(check, (latency_ms * 10) < heartbeatInterval_ms ? heartbeatInterval_ms : latency_ms * 10);
        }


        function check() {

            if (!(socket?.readyState === 'open')) { return setTimeout(check, 1000); }

            clearTimeout(heartbeatTimeout);
            sendPing();

            heartbeatTimeout = setTimeout(
                isBroken,
                latency_ms ? latency_ms * 100 : heartbeatInterval_ms || 30000
            );

            function isBroken() { close(1006, 'Connection closed abnormally (closing handshake did not occur).'); }
        }
    }
    function sendPing(payload = '') {

        if (socket?.readyState === 'open') {

            if (payload) {

                if (!Buffer.isBuffer(payload)) { payload = Buffer.from(payload, ''); }
                if (payload.length > 125) { payload = payload.subarray(0, 125); }
            }

            sendFrames(payload, { opcode: 9 }, function () {

                pDebug(`Ping >`);

                pingStartTime = performance.now();
            });
        }
    }
    function sendPong(payload = '') {

        if (socket?.readyState === 'open') {

            if (payload) {

                if (!Buffer.isBuffer(payload)) { payload = Buffer.from(payload, ''); }
                if (payload.length > 125) { payload = payload.subarray(0, 125); }
            }

            sendFrames(payload, { opcode: 10 }, function () {

                pDebug(`Pong >`);
            });
        }
    }
    function close(code = 0, reason = '') {

        clearTimeout(heartbeatTimeout);

        // Going away (e.g. browser tab closed).
        if (code === 1001) { readyState = ws.CLOSED; }

        if (readyState === ws.OPEN) {

            sendClosingHandshake(function () {

                wasCleanClose = true;

                if (request instanceof http.ClientRequest) {
                    // Role Of Client
                    ws.end = end;
                    close.timeout = setTimeout(end, 10000);
                }
                else {
                    // Role Of Server
                    Promise.resolve(1).then(end);
                }
            });
            readyState = ws.CLOSING;
        }
        else if (readyState === ws.CLOSING) {

            sendClosingHandshake(function () {

                if (request instanceof http.ClientRequest) {
                    // Role Of Client
                    ws.end = end;
                    close.timeout = setTimeout(end, 10000);
                }
                else {
                    // Role Of Server
                    Promise.resolve(1).then(end);
                }
            });
        }
        else if (readyState === ws.CLOSED) {

            clearTimeout(close.timeout);
            end();
        }
        else {

            clearTimeout(close.timeout);
            code = 1006;
            reason = 'Connection closed abnormally (closing handshake did not occur).';
            end();
        }


        function sendClosingHandshake(cb) {

            if (socket?.readyState === 'open' || socket?.readyState === 'writeOnly') {

                pDebug(`CloseFrame > code: ${code} reason: '${reason}'`);

                if (!Buffer.isBuffer(reason)) { reason = Buffer.from(reason, 'utf8'); }
                if (reason.length > 125) { reason = reason.subarray(0, 125); }

                var buf = Buffer.allocUnsafe(2);
                buf.writeUInt16BE(code);
                buf = Buffer.concat([buf, reason]);

                sendFrames(buf, { opcode: 8 }, cb);
            }
            else {

                wasCleanClose = false;
                end();
            }
        }
        function end() {

            if (typeof extension?.close === 'function') {

                extension.close(function (err) {

                    if (err) { ws.emit('error', err); }

                    _end();
                });
            }

            else { _end(); }


            function _end() {

                socket?.end();

                ws.emit('close', { code, reason: reason.toString(), wasCleanClose });

                pDebug(`Closed code: ${code} reason: ${reason.toString() }  wasClean: ${wasCleanClose}`);
            }
        }
    }
    function sendData(payload) {

        if (readyState === ws.OPEN && (socket?.readyState === 'open' || socket?.readyState === 'writeOnly')) {

            sendFrames(payload, {}, function (length, opcode) {

                pDebug(`Data > length: ${length} opcode: ${opcode}`);
            });
        }
    }
    function sendFrames(payload = '', {
        isRsv1 = false,
        isRsv2 = false,
        isRsv3 = false,
        opcode = 2,
        maskingKey = null
    }, callback = function () { }) {

        // setup
        if (typeof payload === 'string' && opcode === 2) { opcode = 1; }
        if (typeof payload === 'string') { payload = Buffer.from(payload, 'utf8'); }

        var payloadLength = Buffer.byteLength(payload, 'utf8'),
            writtenBytes = 0;

        if (opcode < 3 && typeof extension?.processOutgoingMessage === 'function') {

            extension.processOutgoingMessage({
                isFin: false,
                isRsv1,
                isRsv2,
                isRsv3,
                opcode,
                isMasked: Boolean(maskingKey),
                payloadLength,
                maskingKey,
                payload
            }, function (err, message) {

                if (err) {

                    ws.emit('error', err);
                    ws.close(1011, err);

                    return;
                }

                isRsv1 = message.isRsv1;
                isRsv2 = message.isRsv2;
                isRsv3 = message.isRsv3;
                opcode = message.opcode;
                isMasked = message.isMasked;
                payloadLength = message.payloadLength;
                maskingKey = message.maskingKey;
                payload = message.payload;

                waitDrain();
            });
        }

        else { waitDrain(); }


        function waitDrain() {

            if (!(readyState === ws.OPEN || readyState === ws.CLOSING && opcode === 8)) { return; }

            if (socket.writableNeedDrain) { socket.once('drain', write); }

            else { Promise.resolve(1).then(write); }
        }
        function write() {

            var availableLength = socket.writableHighWaterMark - socket.writableLength,
                maxPayloadLength = availableLength - calcHeaderLength(availableLength);

            writeFrame(payload.subarray(writtenBytes, writtenBytes + maxPayloadLength));

            if (writtenBytes < payload.length) { waitDrain(); }

            else { callback(writtenBytes, opcode); }
        }
        function calcHeaderLength(bufLength) {

            if (bufLength >= 65536) {

                return maskingKey ? 14 : 10;
            }
            else if (bufLength > 125) {

                return maskingKey ? 8 : 4;
            }
            else {

                return maskingKey ? 6 : 2;
            }
        }
        function writeFrame(buf) {

            var isFin = !(writtenBytes + buf.length < payload.length);

            masking(function () {

                processOutgoingFrame(writeToSocket);
            });


            function masking(cb) {

                if (!maskingKey) { return cb(); }

                if (typeof extension?.mask === 'function') {

                    extension.mask({
                        isFin,
                        isRsv1,
                        isRsv2,
                        isRsv3,
                        opcode,
                        isMasked: Boolean(maskingKey),
                        payloadLength: buf.length,
                        maskingKey,
                        payload: buf,
                    },
                        function (err, frame) {

                            if (err) {

                                ws.emit('error', err);
                                ws.close(1011, err);

                                return;
                            }

                            isRsv1 = frame.isRsv1;
                            isRsv2 = frame.isRsv2;
                            isRsv3 = frame.isRsv3;
                            opcode = frame.opcode;
                            maskingKey = frame.maskingKey;
                            buf = frame.payload;

                            cb();
                        });

                    return;
                }

                for (var i = 0, n = buf.length; i < n; i++) {

                    buf[i] = buf[i] ^ maskingKey[i & 3];
                }

                cb();
            }
            function processOutgoingFrame(cb) {

                if (typeof extension?.processOutgoingFrame === 'function') {


                    extension.processOutgoingFrame({
                        isFin,
                        isRsv1,
                        isRsv2,
                        isRsv3,
                        opcode,
                        isMasked: Boolean(maskingKey),
                        payloadLength: buf.length,
                        maskingKey,
                        payload: buf,
                    },
                        function (err, f) {

                            if (err) {

                                ws.emit('error', err);
                                ws.close(1011, err);

                                return;
                            }

                            isFin = f.isFin;
                            isRsv1 = f.isRsv1;
                            isRsv2 = f.isRsv2;
                            isRsv3 = f.isRsv3;
                            opcode = f.opcode;
                            isMasked = f.isMasked;
                            payloadLength = f.payloadLength;
                            maskingKey = f.maskingKey;
                            payload = f.payload;
                            cb();
                        });

                    return;
                }

                cb();
            }
            function writeToSocket() {

                socket.cork();
                socket.write(header());
                socket.write(buf);
                socket.uncork();
            }
            function header() {

                var bufHeader = Buffer.allocUnsafe(calcHeaderLength(buf.length)),
                    index = 0;

                // firstByte
                var firstByte = writtenBytes ? 0x00 : opcode;
                if (isRsv1) { firstByte = firstByte | 0x40; }
                if (isRsv2) { firstByte = firstByte | 0x20; }
                if (isRsv3) { firstByte = firstByte | 0x10; }
                if (isFin) { firstByte = firstByte | 0x80; }
                bufHeader.writeUInt8(firstByte, index);
                index += 1;

                // secondByte
                var secondByte = maskingKey ? 0x80 : 0x00;
                if (buf.length >= 65536) {

                    secondByte |= 127;
                    bufHeader.writeUInt8(secondByte, index);
                    index += 1;
                    bufHeader.writeBigUInt64BE(BigInt(buf.length), index);
                    index += 8;
                }
                else if (buf.length > 125) {

                    secondByte |= 126;
                    bufHeader.writeUInt8(secondByte, index);
                    index += 1;
                    bufHeader.writeUInt16BE(buf.length, index);
                    index += 2;
                }
                else {

                    secondByte |= buf.length;
                    bufHeader.writeUInt8(secondByte, index);
                    index += 1;
                }

                // masking key
                if (maskingKey) {

                    bufHeader.writeUInt8(maskingKey[0], ++index);
                    bufHeader.writeUInt8(maskingKey[1], ++index);
                    bufHeader.writeUInt8(maskingKey[2], ++index);
                    bufHeader.writeUInt8(maskingKey[3], ++index);
                }

                writtenBytes += buf.length;

                return bufHeader;
            }
        }
    }
    function readInput() {

        if (ws.readyState !== ws.OPEN) { return; }

        socket.pause();

        // calc inChunk
        if (!inChunk) {

            if (!inChunks.length) { return; }

            inChunk = inChunks.shift();
            inOffset = 0;
        }
        if (inChunk.length < 14 && inChunks.length) { inChunk += inChunks.shift(); }
        if (inChunk.length < 2) { return socket.resume(); }


        // read frame
        readFrame(function () {

            frameHandling();
            Promise.resolve(1).then(next);
        });


        function readFrame(callback) {

            // Continuous payload
            if (inFrame) {

                // continuous frame
                if (inFrame.payload.length < inFrame.payloadLength) {

                    var contBuf = getPayloadBuffer(0, inFrame.payloadLength - inFrame.payload.length);
                    inFrame.payload = Buffer.concat([
                        inFrame.payload,
                        contBuf
                    ]);

                    inOffset = contBuf.length;
                    calcResidue();
                }

                unmask(inFrame, callback);

                return;
            }

            // new frame
            inOffset += 2;

            var isFin = Boolean(inChunk[0] & 0x80),
                isRsv1 = Boolean(inChunk[0] & 0x40),
                isRsv2 = Boolean(inChunk[0] & 0x20),
                isRsv3 = Boolean(inChunk[0] & 0x10),
                opcode = inChunk[0] & 0x0F,
                isMasked = Boolean(inChunk[1] & 0x80),
                payloadLength = inChunk[1] & 0x7F,
                maskingKey = null,
                payload = null;

            //** read payload length **//
            if (payloadLength === 126) {

                if (inChunk.length - inOffset < 2) {

                    inOffset = 0;

                    return null;
                }

                payloadLength = inChunk.readUInt16BE(inOffset);

                inOffset += 2;
            }
            else if (payloadLength === 127) {

                if (inChunk.length - inOffset < 8) {

                    inOffset = 0;

                    return null;
                }

                payloadLength = Number(inChunk.readBigUInt64BE(inOffset));

                inOffset += 8;
            }

            //** read masking key **//
            if (isMasked) {

                if (inChunk.length - inOffset < 4) {

                    inOffset = 0;

                    return null;
                }

                maskingKey = [
                    inChunk[inOffset],
                    inChunk[inOffset + 1],
                    inChunk[inOffset + 2],
                    inChunk[inOffset + 3]
                ];

                inOffset += 4;
            }

            //** read payload buffer **//
            payload = getPayloadBuffer(inOffset, inOffset + payloadLength);
            inOffset += payload.length;

            calcResidue();


            inFrame = {
                isFin, isRsv1, isRsv2, isRsv3, opcode,
                isMasked, payloadLength, maskingKey, payload
            };

            unmask(inFrame, callback);


            function getPayloadBuffer(start, end) {

                // is continuous
                if (inChunk.length < end) {

                    return inChunk.subarray(start, inChunk.length);
                }

                return inChunk.subarray(start, end);
            }
            function unmask(frame, cb) {

                // continuous frame or not masked
                if (frame.payload.length < frame.payloadLength || !frame.isMasked) { return cb(); }

                if (typeof extension?.unmask === 'function') {

                    extension.unmask(frame, function (err, f) {

                        if (err) {

                            ws.emit('error', err);
                            ws.close(1011, err);

                            return;
                        }

                        Object.keys(f).forEach(function (k) {

                            frame[k] = f[k];
                        });

                        cb();
                    });

                    return;
                }


                for (var i = 0; i < frame.payloadLength; i++) {

                    frame.payload[i] ^= frame.maskingKey[i & 3];
                }

                cb();
            }
            function calcResidue() {

                if (inOffset < inChunk.length) {

                    inChunk = inChunk.subarray(inOffset);
                }

                else { inChunk = null; }

                inOffset = 0;
            }
        }
        function frameHandling() {

            // continuous frame
            if (inFrame.payload.length < inFrame.payloadLength) { return; }

            if (typeof extension?.processIncomingFrame === 'function') {

                extension.processIncomingFrame(inFrame, function (err, f) {

                    if (err) {

                        ws.emit('error', err);
                        ws.close(1011, err);

                        return;
                    }

                    Object.keys(f).forEach(function (k) { inFrame[k] = f[k]; });
                    handling();
                });

                return;
            }

            handling();


            function handling() {

                switch (inFrame.opcode) {

                    // Continuation - Identifies an intermediate frame of a fragmented message.
                    case 0:
                    // Text - UTF-8 encoded application text.
                    case 1:
                    // Binary - Application binary data.
                    case 2:
                        pDebug(`Event: Data < length: ${inFrame.payloadLength} opcode: ${inFrame.opcode}`);
                        pushData();
                        break;

                    // Close
                    case 8:
                        var code = inFrame.payload.length ? inFrame.payload.readUInt16BE() : 0,
                            reason = inFrame.payload.subarray(2);

                        //if (!code) { code = 1005; reason = 'No code received.'; }

                        pDebug(`Event: Close < code: ${code} reason: '${reason}'`);

                        if (readyState === ws.OPEN) {

                            readyState = ws.CLOSING;
                            close(code, reason);
                            wasCleanClose = true;
                        }
                        else {

                            readyState = ws.CLOSED;
                            close(code, reason);
                        }

                        break;

                    // Ping
                    case 9:
                        pDebug(`Event: Ping <`);

                        if (inFrame.payload.length > 125) { ws.close(1009); }

                        sendPong(inFrame.payload);

                        Promise.resolve(1).then(function () { ws.emit('ping', { data: inFrame?.payload || null }); });
                        break;

                    // Pong
                    case 10:
                        if (inFrame.payload.length > 125) { ws.close(1009); }

                        if (pingStartTime) {

                            latency_ms = performance.now() - pingStartTime;
                            pingStartTime = 0;

                            pDebug(`Event: Pong < Latency: ${latency_ms.toFixed(2)}ms.`);

                            heartbeat();
                        }

                        Promise.resolve(1).then(function () { ws.emit('pong', { data: inFrame?.payload || null, latency_ms }); });
                        break;

                    default:
                        ws.emit('error', `Input frame 'opcode:${inFrame.opcode}' is not in use.`)
                        break;
                }

                inFrame = null;
            }
            function pushData() {

                inFrames.push(inFrame);

                if (inFrame.isFin) {

                    Promise.resolve(1).then((function (inFrames) {

                        calaMessage(inFrames, function (data, isBinary) {

                            ws.emit('message', { data, isBinary });
                        });

                    })(inFrames));

                    inFrames = [];
                }


                function calaMessage(inFrames, cb) {

                    if (inFrames.length) {

                        var buf = Buffer.concat(
                            inFrames.map(function (f) {
                                return f.payload
                            })
                        );

                        if (typeof extension?.processIncomingMessage === 'function') {

                            extension.processIncomingMessage({
                                isFin: true,
                                isRsv1: inFrames[0].isRsv1,
                                isRsv2: inFrames[0].isRsv2,
                                isRsv3: inFrames[0].isRsv3,
                                opcode: inFrames[0].opcode,
                                isMasked: inFrames[0].isMasked,
                                payloadLength: buf.length,
                                maskingKey: inFrames[0].maskingKey,
                                payload: buf
                            }, function (err, message) {

                                if (err) {

                                    ws.emit('error', err);
                                    ws.close(1011, err);

                                    return;
                                }

                                cb(message.opcode === 1 ? message.payload.toString('utf8') : message.payload, inFrames[0].opcode !== 1);
                            });
                        }
                        else {

                            cb(inFrames[0].opcode === 1 ? buf.toString('utf8') : buf, inFrames[0].opcode !== 1);
                        }
                    }
                }
            }
        }
        function next() {

            if (inChunk?.length) { readInput(); }
            else if (inChunks.length) { readInput(); }
            else { socket.resume(); }
        }
    }

    function pDebug(msg) { if (isDebug) { console.log(`[ DEBUG ] ${msg} :: Address: ${ws.ip}:${ws.port}`); } }
    function pError(msg) { if (isDebug) { console.error(`[ ERROR ] ${msg} :: Address: ${ws.ip}:${ws.port}`); } }
}


createWebSocket.CONNECTING = 0;
createWebSocket.OPEN = 1;
createWebSocket.CLOSING = 2;
createWebSocket.CLOSED = 3;
module.exports = createWebSocket;
