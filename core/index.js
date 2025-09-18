/**  Copyright (c) Manuel Lõhmus (MIT License). */

// WebSocket
"use strict";

const { Buffer, Blob: BufferBlob } = require('node:buffer'),
    crypto = require('node:crypto'),
    EventEmitter = require('node:events'),
    { Socket } = require('node:net'),
    http = require('node:http'),
    { performance } = require('node:perf_hooks'),
    createPermessageDeflate = require('./permessage-deflate');

// Static constants for convenience
createWebSocket.CONNECTING = 0;
createWebSocket.OPEN = 1;
createWebSocket.CLOSING = 2;
createWebSocket.CLOSED = 3;

createWebSocket.createWebSocket = createWebSocket;
createWebSocket.createRegistry = createRegistry;
createWebSocket.attachServer = attachServer;

module.exports = createWebSocket;


/**
 * @typedef Options for WebSocket
 * @property {boolean} isDebug
 * @property {http.IncomingMessage|http.ClientRequest} request
 * @property {object} headers
 * @property {net.Socket} socket
 * @property {string|string[]} protocol
 * @property {string} origin
 * @property {number} heartbeatInterval_ms
 * @property {Extension|null} extension
 * @property {boolean} autoReconnect
 * @property {number} reconnectAttempts
 * @property {number} reconnectDelay
 * @property {number} reconnectBackoff
 * @property {number} reconnectMaxDelay
 * @property {() => http.ClientRequest} requestFactory
 * @property {(evt:{code:number,reason:string,wasClean:boolean})=>boolean} shouldReconnect
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
 * @typedef Frame
 * @property {boolean} isFin
 * @property {boolean} isRsv1
 * @property {boolean} isRsv2
 * @property {boolean} isRsv3
 * @property {number} opcode
 * @property {boolean} isMasked
 * @property {number} payloadLength
 * @property {[]|null} maskingKey
 * @property {Buffer|null} payload
 */

/**
 * WebSocket constructor function.
 * @param {Options} options
 * @returns {EventEmitter & WebSocket}
 */
function createWebSocket({
    isDebug = false,
    request,
    headers,
    socket,
    protocol = '',
    origin = '',
    binaryType = 'nodebuffer',
    heartbeatInterval_ms = 0,
    extension = createPermessageDeflate(),
    // auto-reconnect (client only)
    autoReconnect = false,
    reconnectAttempts = 0,         // 0 => infinite
    reconnectDelay = 1000,
    reconnectBackoff = 1.5,
    reconnectMaxDelay = 30000,
    requestFactory = null,
    shouldReconnect = (evt) => !evt.wasClean || evt.code !== 1000
} = {}) {

    if (createWebSocket === this?.constructor) { throw new Error('This function must be used without the `new` keyword.'); }

    const isClient = request instanceof http.ClientRequest;

    // Client: must be http.ClientRequest (or requestFactory provided for reconnect)
    if (!isRoleOfServer() && !isClient) { return null; }

    const ws = new EventEmitter();
    let readyState = 0,
        heartbeatTimeout,
        latency_ms = 0,
        pingStartTime = 0,
        wasClean = false,
        inChunks = [],
        inChunk = null,
        inOffset = 0,
        inFrame = null,
        inFrames = [],
        outBuffer = Buffer.alloc(0),
        sec_websocket_extensions = '',
        closePromiseResolvers = [],

        reconnectState = {
            enabled: Boolean(autoReconnect && isClient && typeof requestFactory === 'function'),
            attempts: 0,
            timer: null,
        };

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

        // METHODS
        close: { value: close, writable: false, configurable: false, enumerable: false },
        heartbeat: { value: heartbeat, writable: false, configurable: false, enumerable: false },
        send: { value: sendData, writable: false, configurable: false, enumerable: false },
        sendPing: { value: sendPing, writable: false, configurable: false, enumerable: false },
        sendPong: { value: sendPong, writable: false, configurable: false, enumerable: false },

        // ATTRIBUTES
        path: { get() { return request?.url || request?.path || ''; }, configurable: false, enumerable: false },
        origin: { get() { return origin; }, set(val) { origin = val; }, configurable: false, enumerable: false },
        heartbeatInterval_ms: {
            get() { return heartbeatInterval_ms; },
            set(val) { if (typeof val === 'number') { heartbeatInterval_ms = val; } },
            configurable: false, enumerable: false
        },
        ip: { get() { return headers?.['x-forwarded-for'] || socket?.remoteAddress || '' }, configurable: false, enumerable: false },
        port: { get() { return socket?.remotePort || '' }, configurable: false, enumerable: false },
        latency_ms: { get() { return latency_ms }, configurable: false, enumerable: false },
        binaryType: {
            get() { return binaryType; },
            set(val) {
                const v = String(val || '').toLowerCase();
                if (v === 'arraybuffer' || v === 'nodebuffer' || v === 'blob') {
                    binaryType = v;
                }
                else {
                    pDebug('Unsupported binaryType, using default "arraybuffer"', v);
                    binaryType = 'arraybuffer';
                }
            },
            configurable: false, enumerable: false
        },

        bufferedAmount: { get() { return socket?.writableLength || 0; }, configurable: false, enumerable: false },
        extensions: { get() { return sec_websocket_extensions; }, configurable: false, enumerable: false },
        protocol: { get() { return protocol; }, configurable: false, enumerable: false },
        readyState: { get() { return readyState; }, configurable: false, enumerable: false },
        url: { get() { return request?.url || request?.path || ''; }, configurable: false, enumerable: false },
    });

    ws.on('open', (event) => { if (typeof ws.onopen === 'function') ws.onopen.call(ws, event); });
    ws.on('message', (event) => { if (typeof ws.onmessage === 'function') ws.onmessage.call(ws, event); });
    ws.on('ping', (event) => { if (typeof ws.onping === 'function') ws.onping.call(ws, event); });
    ws.on('pong', (event) => { if (typeof ws.onpong === 'function') ws.onpong.call(ws, event); });
    ws.on('close', (event) => { if (typeof ws.onclose === 'function') ws.onclose.call(ws, event); });
    ws.on('error', (event) => { if (typeof ws.onerror === 'function') ws.onerror.call(ws, event); });

    if (typeof extension?.init === 'function') { extension.init(ws); }

    // Role Of Client
    if (isClient) { Promise.resolve(1).then(connect); }
    // Role Of Server
    else {
        socket.on('error', errorHandling);
        socket.on('end', endHandling);
        socket.on('data', incomingData);
        sendHandshakeResponse();
        heartbeatTimeout = setTimeout(heartbeat);
    }

    return ws;


    function connect() {

        const key = generateKey(), accept = generateAccept(key);

        // headers
        request.setHeader('Cache-Control', 'no-cache');
        request.setHeader('Connection', 'Upgrade');
        request.setHeader('Upgrade', 'websocket');
        request.setHeader('Sec-WebSocket-Key', key);
        request.setHeader('Sec-WebSocket-Version', '13');

        if (protocol) {
            const protoHdr = Array.isArray(protocol) ? protocol.join(', ') : protocol;
            request.setHeader('Sec-WebSocket-Protocol', protoHdr);
        }
        if (origin) { request.setHeader('Origin', origin); }

        socket = request.socket;
        socket?.once('ready', function () {
            pDebug("The client's handshake `request` has been sent.", "ip", ws.ip);
        });

        request.on('upgrade', function (response, _socket, head) {

            const err = validateHandshake(response?.headers);

            if (err) { return destroy(new Error(err)); }

            socket.pause();

            if (head.length) socket.unshift(head);

            if (response?.headers?.["sec-websocket-protocol"]) {
                protocol = response.headers["sec-websocket-protocol"];
            }

            if (response?.headers?.["sec-websocket-extensions"]) {

                if (typeof extension?.activate === 'function') {

                    extension.activate(response.headers, function (err, isActivate) {

                        if (err) { return destroy(err instanceof Error ? err : new Error(String(err))); }

                        sec_websocket_extensions = response?.headers?.["sec-websocket-extensions"] || '';
                        isActivate ? open() : destroy(new Error('Unsupported websocket extension.'));
                    });
                }
                else {
                    destroy(new Error('Unsupported websocket extension.'));
                }
            }
            else {
                extension = null;
                open();
            }

            function open() {

                socket.on('error', errorHandling);
                socket.on('end', endHandling);
                socket.on('data', incomingData);

                readyState = ws.OPEN;
                ws.emit('open');
                setTimeout(() => socket.resume());
                pDebug('The client handshake is "Accepted".', "ip", ws.ip);
                // reset reconnect counters
                reconnectState.attempts = 0;
            }
            function destroy(error) {

                ws.emit('error', error instanceof Error ? error : new Error(String(error)));
                request.destroy(error);
            }
        });

        request.on('error', function (error) {

            if (error?.code === 'ECONNRESET') {
                return unsupported();
            }
            ws.emit('error', error instanceof Error ? error : new Error(String(error)));
        });

        request.on('response', function () { unsupported(); });

        if (typeof extension?.generateOffer === 'function') {
            request.setHeader('Sec-WebSocket-Extensions', 'permessage-deflate; client_max_window_bits');
            request.end();
        }
        else {
            request.end();
        }

        function unsupported() {

            ws.emit('error', new Error('Unsupported websocket'));
            pError('Unsupported websocket');
            scheduleReconnect({ code: 1006, reason: 'Unsupported websocket', wasClean: false });
        }
        function validateHandshake(headers = {}) {

            if ((headers['connection'] || '').toLowerCase() !== 'upgrade') { return 'Invalid `Connection` header'; }
            if ((headers['upgrade'] || '').toLowerCase() !== 'websocket') { return 'Invalid `Upgrade` header'; }
            if (headers['sec-websocket-accept'] !== accept) { return 'Invalid `Sec-WebSocket-Accept` header'; }

            if (protocol) {
                const serverProto = (headers['sec-websocket-protocol'] || '').split(',')
                    .map(s => s.trim().toLowerCase()).filter(Boolean),

                    requested = Array.isArray(protocol)
                        ? protocol.map(s => String(s).trim().toLowerCase())
                        : String(protocol).split(',').map(s => s.trim().toLowerCase());

                if (serverProto.length && !serverProto.some(p => requested.includes(p))) {
                    return 'Server sent a subprotocol but none was requested';
                }
            }

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
        if (!(socket instanceof Socket)) { return false; }
        if (!headers && request?.headers) { headers = request.headers; }
        if (!socket || headers?.["sec-websocket-version"] !== '13' || !headers?.["sec-websocket-key"]) { return false; }

        // subprotocol negotiation
        if (protocol && headers && headers["sec-websocket-protocol"]) {

            const offerProtocols = headers["sec-websocket-protocol"].split(',')
                .map(entry => (entry + '').trim().toLowerCase()),

                supportedProtocols = Array.isArray(protocol)
                    ? protocol.map(p => (p + '').trim().toLowerCase())
                    : (protocol + '').split(',').map(entry => (entry + '').trim().toLowerCase()),

                selected = offerProtocols.find(entry => supportedProtocols.includes(entry)) || '';

            if (!selected && protocol) { return false; }

            protocol = selected;
        }

        if (origin && headers?.origin !== origin) {
            if (!headers?.host || origin.indexOf(headers.host) === -1) {
                return false;
            }
        }

        if (heartbeatInterval_ms === 0) { heartbeatInterval_ms = 30000; }

        return true;
    }
    function sendHandshakeResponse() {

        if (!headers) { throw new Error('Header entries are required'); }

        const _key = headers["sec-websocket-key"],
            _headers = [
                'HTTP/1.1 101 Switching Protocols',
                'Connection: Upgrade',
                'Upgrade: websocket',
            ];

        if (protocol) { _headers.push(`Sec-WebSocket-Protocol: ${protocol}`); }

        _headers.push(`Sec-WebSocket-Accept: ${generateAccept(_key)}`);

        if (headers?.["sec-websocket-extensions"] && typeof extension?.generateResponse === 'function') {

            extension.generateResponse(headers, function (err, extensionHeaderValue) {

                if (err) {
                    ws.emit('error', err instanceof Error ? err : new Error(String(err)));
                    ws.close(1010, String(err));
                    return;
                }

                if (typeof extensionHeaderValue === 'string' && extensionHeaderValue) {
                    _headers.push('Sec-WebSocket-Extensions: ' + extensionHeaderValue);
                    sec_websocket_extensions = extensionHeaderValue;
                }

                send();
            });
        }
        else {
            extension = null;
            send();
        }

        return;


        function send() {

            socket.write(_headers.concat('\r\n').join('\r\n'), function () {

                readyState = ws.OPEN;
                pDebug('The server handshake `response` has been sent.', "ip", ws.ip);
                ws.emit('open');
            });
        }
    }
    function errorHandling(err) {

        pError(err);
        ws.emit('error', err instanceof Error ? err : new Error(String(err)));
    }
    function incomingData(buf) {

        inChunks.push(buf);

        try {
            readInput();
        }
        catch (err) {
            ws.emit('error', err instanceof Error ? err : new Error(String(err)));
            close(1011, 'Internal server error.');
        }
    }
    function endHandling() {

        readyState = ws.CLOSED;

        if (!wasClean) {
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
            heartbeat.callbacks
                .forEach(function (cb) { cb(latency_ms); });
            heartbeat.callbacks = [];
        }

        if (typeof callback === 'function') {
            heartbeat.callbacks
                .push(callback);
            latency_ms = 0;
            check();

            return;
        }

        clearTimeout(heartbeatTimeout);

        if (heartbeatInterval_ms > 0) {
            heartbeatTimeout = setTimeout(check, heartbeatInterval_ms);
        }

        return;


        function check() {

            if (!isSocketWritable(socket)) { return setTimeout(check, 500); }
            clearTimeout(heartbeatTimeout);
            sendPing();

            heartbeatTimeout = setTimeout(function () {
                close(1006, 'Heartbeat timeout.')
            }, Math.max(heartbeatInterval_ms * 2, 30000));
        }
    }
    function sendPing(payload = '') {

        if (isSocketWritable(socket)) {

            if (payload) {
                if (!Buffer.isBuffer(payload)) { payload = Buffer.from(payload, ''); }
                if (payload.length > 125) { payload = payload.subarray(0, 125); }
            }

            sendFrames({ payload, opcode: 9 }, function () {
                pDebug(`Ping >`, "ip", ws.ip);
                pingStartTime = performance.now();
            }).catch(() => { });
        }
    }
    function sendPong(payload = '') {

        if (isSocketWritable(socket)) {

            if (payload) {
                if (!Buffer.isBuffer(payload)) { payload = Buffer.from(payload, ''); }
                if (payload.length > 125) { payload = payload.subarray(0, 125); }
            }

            sendFrames({ payload, opcode: 10 }, function () {
                pDebug(`Pong >`, "ip", ws.ip);
            }).catch(() => { });
        }
    }
    function close(code = 1000, reason = '') {

        return new Promise((resolve) => {

            closePromiseResolvers.push(resolve);
            clearTimeout(heartbeatTimeout);

            // Going away (e.g. browser tab closed).
            if (code === 1001) { readyState = ws.CLOSED; }

            if (readyState === ws.OPEN) {
                sendClosingHandshake(function () {

                    wasClean = true;

                    if (isClient) {
                        ws.end = end;
                        close.timeout = setTimeout(end, 10000);
                    }
                    else {
                        Promise.resolve(1).then(end);
                    }
                });
                readyState = ws.CLOSED;
            }
            else if (readyState === ws.CLOSING) {
                sendClosingHandshake(function () {

                    if (isClient) {
                        ws.end = end;
                        close.timeout = setTimeout(end, 10000);
                    }
                    else {
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

            return;


            function sendClosingHandshake(cb) {

                if (isSocketWritable(socket) || socket?.readyState === 'writeOnly') {
                    pDebug(`CloseFrame > code: ${code} reason: '${reason}'`, "ip", ws.ip);

                    if (!Buffer.isBuffer(reason)) { reason = Buffer.from(reason, 'utf8'); }
                    if (reason.length > 125) { reason = reason.subarray(0, 125); }

                    let payload = Buffer.allocUnsafe(2);
                    payload.writeUInt16BE(code);
                    payload = Buffer.concat([payload, reason]);
                    sendFrames({ payload, opcode: 8 }, cb).catch(() => cb());
                }
                else {
                    wasClean = false;
                    end();
                }
            }
            function end() {

                if (typeof extension?.close === 'function') {
                    extension.close(function (err) {

                        if (err) {
                            ws.emit('error', err instanceof Error ? err : new Error(String(err)));
                        }
                        _end();
                    });
                }
                else { _end(); }

                return;


                function _end() {

                    try { socket?.end(); } catch (_) { }

                    const evt = { code, reason: reason.toString(), wasClean };

                    ws.emit('close', evt);
                    pDebug(`Closed code: ${code} reason: ${reason.toString()}  wasClean: ${wasClean}`, "ip", ws.ip);

                    // resolve any awaiting close promises
                    const resolvers = closePromiseResolvers.slice();
                    closePromiseResolvers.length = 0;
                    resolvers.forEach(r => r(evt));

                    // schedule possible reconnect (client only)
                    scheduleReconnect(evt);

                    // cleanup inbound buffers
                    inChunks = []; inChunk = null; inFrames = []; inFrame = null;
                }
            }
        });
    }
    function sendData(payload, isFinal = true) {

        return sendFrames({ payload, isFin: isFinal }, function (err, length, opcode) {
            pDebug(`Data > length: ${length} opcode: ${opcode}`, "ip", ws.ip);
        }).catch(() => { });
    }
    function sendFrames(options = {}, callback) {

        return new Promise(function (resolve, reject) {

            if (!isSocketWritable(socket)) {
                return doneCallback(new Error('Socket not open'));
            }

            const outFrame = {
                ...{
                    isFin: true,
                    isRsv1: false,
                    isRsv2: false,
                    isRsv3: false,
                    isMasked: isClient,
                    opcode: 2,
                    maskingKey: null,
                    payload: '',
                },
                ...options
            };

            // normalize payload
            if (typeof outFrame.payload === 'string' && outFrame.opcode === 2) { outFrame.opcode = 1; }
            if (typeof outFrame.payload === 'string') { outFrame.payload = Buffer.from(outFrame.payload, 'utf8'); }
            if (!Buffer.isBuffer(outFrame.payload)) { outFrame.payload = Buffer.from(outFrame.payload); }

            outFrame.payloadLength = Buffer.byteLength(outFrame.payload, 'utf8');

            let writtenBytes = 0;

            processOutgoingMessage();

            return;


            function doneCallback(err, totalLen, opcode) {

                try { callback(err, totalLen, opcode); } catch (_) { }

                if (err) { reject(err); }
                else { resolve({ totalLen, opcode }); }
            }
            function processOutgoingMessage() {

                if (outFrame.opcode < 3 && typeof extension?.processOutgoingMessage === 'function') {
                    extension.processOutgoingMessage(outFrame, function (err, frame) {

                        if (err) {
                            err = err instanceof Error ? err : new Error(String(err));
                            ws.emit('error', err);
                            ws.close(1011, err);
                            return doneCallback(err);
                        }

                        Object.assign(outFrame, frame);
                        masking();
                    });
                }
                else { masking(); }
            }
            function masking() {

                // RFC 6455 – client MUST mask every frame; server MUST NOT mask
                if (outFrame.isMasked && !outFrame.maskingKey) { outFrame.maskingKey = crypto.randomBytes(4); }

                if (!outFrame.maskingKey) { return processOutgoingFrame(); }

                if (typeof extension?.mask === 'function') {
                    extension.mask(outFrame, function (err, frame) {

                        if (err) {
                            err = err instanceof Error ? err : new Error(String(err));
                            ws.emit('error', err);
                            ws.close(1011, err);
                            return doneCallback(err);
                        }

                        Object.assign(outFrame, frame);
                        processOutgoingFrame();
                    });

                    return;
                }

                for (var i = 0, n = outFrame.payload.length; i < n; i++) {
                    outFrame.payload[i] ^= outFrame.maskingKey[i & 3];
                }

                processOutgoingFrame();
            }
            function processOutgoingFrame() {

                if (typeof extension?.processOutgoingFrame === 'function') {
                    extension.processOutgoingFrame(outFrame, function (err, frame) {

                        if (err) {
                            err = err instanceof Error ? err : new Error(String(err));
                            ws.emit('error', err);
                            ws.close(1011, err);
                            return doneCallback(err);
                        }

                        Object.assign(outFrame, frame);
                        writeFrame()
                    });
                }
                else { writeFrame(); }
            }
            function writeFrame() {

                outBuffer = Buffer.concat([
                    outBuffer,
                    header(),
                    outFrame.payload
                ]);
                Promise.resolve(1).then(writeToSocket);
                doneCallback(null, writtenBytes, outFrame.opcode);

                return;


                function header() {

                    const { isFin, isRsv1, isRsv2, isRsv3, opcode, maskingKey, payload } = outFrame,
                        bufHeader = Buffer.allocUnsafe(calcHeaderLength(payload.length));
                    let index = 0;

                    // firstByte
                    var firstByte = (writtenBytes ? 0x00 : opcode);
                    if (isRsv1) { firstByte |= 0x40; }
                    if (isRsv2) { firstByte |= 0x20; }
                    if (isRsv3) { firstByte |= 0x10; }
                    if (isFin) { firstByte |= 0x80; }
                    bufHeader.writeUInt8(firstByte, index);
                    index += 1;

                    // secondByte
                    var secondByte = maskingKey ? 0x80 : 0x00;
                    if (payload.length >= 65536) {
                        secondByte |= 127;
                        bufHeader.writeUInt8(secondByte, index);
                        index += 1;
                        bufHeader.writeBigUInt64BE(BigInt(payload.length), index);
                        index += 8;
                    }
                    else if (payload.length > 125) {
                        secondByte |= 126;
                        bufHeader.writeUInt8(secondByte, index);
                        index += 1;
                        bufHeader.writeUInt16BE(payload.length, index);
                        index += 2;
                    }
                    else {
                        secondByte |= payload.length;
                        bufHeader.writeUInt8(secondByte, index);
                        index += 1;
                    }

                    // masking key
                    if (maskingKey) {
                        bufHeader.writeUInt8(maskingKey[0], index++);
                        bufHeader.writeUInt8(maskingKey[1], index++);
                        bufHeader.writeUInt8(maskingKey[2], index++);
                        bufHeader.writeUInt8(maskingKey[3], index++);
                    }

                    writtenBytes += payload.length;

                    return bufHeader;


                    function calcHeaderLength(bufLen) {

                        if (bufLen >= 65536) {
                            return maskingKey ? 14 : 10;
                        }
                        else if (bufLen > 125) {
                            return maskingKey ? 8 : 4;
                        }
                        else {
                            return maskingKey ? 6 : 2;
                        }
                    }
                }
            }
            function writeToSocket() {

                if (!outBuffer.length) { return; }

                if (!isSocketWritable(socket)) {
                    return doneCallback(new Error('Socket not open for writing'));
                }

                if (socket.writableNeedDrain) { socket.once('drain', write); }
                else { write(); }

                return;


                function write() {

                    const availableLength = socket.writableHighWaterMark - socket.writableLength,
                        writingLength = Math.min(availableLength, outBuffer.length);

                    socket.write(outBuffer.subarray(0, writingLength), onWritten);
                    outBuffer = outBuffer.subarray(writingLength);

                    return;


                    function onWritten() {

                        if (outBuffer.length) { writeToSocket(); }
                    }
                }
            }
        });
    }
    function readInput() {

        socket.pause();

        // calc inChunk
        if (!inChunk) {
            if (!inChunks.length) { return socket.resume(); }

            inChunk = inChunks.shift();
            inOffset = 0;
        }
        if (inChunk.length < 14 && inChunks.length) { Buffer.concat([inChunk, inChunks.shift()]); }
        if (inChunk.length < 2) { return socket.resume(); }

        // read frame
        readFrame(function () {

            frameHandling();
            next();
        });

        return;


        function readFrame(callback) {

            // Continuous payload
            if (inFrame) {
                // continuous frame
                if (inFrame.payload.length < inFrame.payloadLength) {
                    const contBuf = getPayloadBuffer(0, inFrame.payloadLength - inFrame.payload.length);

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
            inChunk.length;
            //** read payload buffer **//
            payload = getPayloadBuffer(inOffset, inOffset + payloadLength);
            inOffset += payload.length;

            calcResidue();


            inFrame = {
                isFin, isRsv1, isRsv2, isRsv3, opcode,
                isMasked, payloadLength, maskingKey, payload
            };

            unmask(inFrame, callback);


            return;


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
                            err = err instanceof Error ? err : new Error(String(err));
                            ws.emit('error', { error: err });
                            ws.close(1011, err);

                            return;
                        }
                        Object.assign(frame, f);
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
                        err = err instanceof Error ? err : new Error(String(err));
                        ws.emit('error', { error: err });
                        ws.close(1011, err);

                        return;
                    }
                    Object.assign(inFrame, f);
                    handling();
                });

                return;
            }

            handling();

            return;


            function handling() {

                switch (inFrame.opcode) {

                    // Continuation - Identifies an intermediate frame of a fragmented message.
                    case 0:
                    // Text - UTF-8 encoded application text.
                    case 1:
                    // Binary - Application binary data.
                    case 2:
                        pDebug(`Event: Data < length: ${inFrame.payloadLength} opcode: ${inFrame.opcode}`, "ip", ws.ip);
                        pushData();
                        break;

                    // Close
                    case 8:
                        var code = inFrame.payload.length ? inFrame.payload.readUInt16BE() : 0,
                            reason = inFrame.payload.subarray(2);

                        //if (!code) { code = 1005; reason = 'No code received.'; }

                        pDebug(`Event: Close < code: ${code} reason: '${reason}'`, "ip", ws.ip);

                        if (readyState === ws.OPEN) {
                            readyState = ws.CLOSING;
                            close(code, reason);
                            wasClean = true;
                        }
                        else {
                            readyState = ws.CLOSED;
                            close(code, reason);
                        }

                        break;

                    // Ping
                    case 9:
                        pDebug(`Event: Ping <`, "ip", ws.ip);

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

                            pDebug(`Event: Pong < Latency: ${latency_ms.toFixed(2)}ms.`, "ip", ws.ip);

                            heartbeat();
                        }

                        Promise.resolve(1).then(function () { ws.emit('pong', { data: inFrame?.payload || null, latency_ms }); });
                        break;

                    default:
                        ws.emit('error', { error: `Input frame 'opcode:${inFrame.opcode}' is not in use.` });
                        break;
                }

                inFrame = null;
            }
            function pushData() {

                inFrames.push(inFrame);

                if (inFrame.isFin) {
                    Promise.resolve(1).then((function (inFrames) {

                        calaMessage(inFrames, function (data, isBinary) {

                            // normalize output by binaryType
                            if (isBinary) {
                                if (binaryType === 'nodebuffer') {
                                    // keep Buffer
                                }
                                else if (binaryType === 'blob') {
                                    data = createBlob(data);
                                }
                                else {
                                    // arraybuffer
                                    //data = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
                                    data = Uint8Array.from(data).buffer;
                                }
                            }
                            else {
                                // text stays text string
                            }
                            ws.emit('message', { data, isBinary });
                        });

                    })(inFrames));

                    inFrames = [];
                }

                return;


                function calaMessage(inFrames, cb) {

                    if (inFrames.length) {
                        const buf = Buffer.concat(
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
                                    err = err instanceof Error ? err : new Error(String(err));
                                    ws.emit('error', { error: err });
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
    function createBlob(data) {

        try {
            const GBlob = globalThis.Blob || BufferBlob;
            return new GBlob([data]);
        }
        catch (_) {
            // fallback to Buffer if Blob not supported
            return Buffer.from(data);
        }
    }
    function isSocketWritable(s) {

        return Boolean(s && !s.destroyed && s.writable);
    }
    function scheduleReconnect(evt) {

        if (!reconnectState.enabled) return;
        if (typeof shouldReconnect === 'function' && !shouldReconnect(evt)) return;

        // guard: only client with requestFactory can reconnect
        if (!(typeof requestFactory === 'function')) return;

        if (reconnectAttempts > 0 && reconnectState.attempts >= reconnectAttempts) return;

        const delay = Math.min(
            Math.floor(reconnectDelay * Math.pow(reconnectBackoff, reconnectState.attempts)),
            reconnectMaxDelay
        );

        reconnectState.attempts += 1;
        clearTimeout(reconnectState.timer);
        reconnectState.timer = setTimeout(function () {

            try {
                request = requestFactory();
                // reset extension for clean negotiate
                if (extension && typeof extension.init === 'function') extension.init(ws);
                Promise.resolve(1).then(connect);
            }
            catch (e) {
                ws.emit('error', e instanceof Error ? e : new Error(String(e)));
                scheduleReconnect({ code: 1006, reason: 'requestFactory failed', wasClean: false });
            }
        }, delay);
    }

    function pDebug(msg) { if (isDebug) { console.log(`[ws13 ${isClient ? 'client' : 'server'} DEBUG]`, ...arguments); } }
    function pError(msg) { if (isDebug) { console.error(`[ws13 ${isClient ? 'client' : 'server'} ERROR ]`, ...arguments); } }
}

/**
 * Simple multi-client registry with broadcast and auto-clean.
 */
function createRegistry() {

    const clients = new Set();

    return {
        add: function (ws) {

            clients.add(ws);
            ws.on('close', onCleanup);
            ws.on('error', onCleanup);

            return ws;


            function onCleanup() {

                return clients.delete(ws);
            }
        },

        delete: function (ws) { return clients.delete(ws); },

        broadcast: function (data) {

            for (const ws of clients) {
                if (ws.readyState === ws.OPEN) {
                    // ignore send errors for broadcast
                    Promise.resolve(ws.send(data)).catch(() => { });
                }
            }
        },

        size: function () { return clients.size; },

        clients
    };
}

/**
 * Attach helper handlers to an HTTP server to simplify upgrade + registry usage.
 * options: { registry?: ReturnType<typeof createRegistry>, onConnect?: (ws, req)=>void }
 */
function attachServer(server, {
    registry = createRegistry(),
    onConnect
} = {}) {

    server.on('upgrade', function (request) {

        const websocket = createWebSocket({ request });

        if (websocket) {
            registry.add(websocket);
            if (typeof onConnect === 'function') onConnect(websocket, request);
        }
        else {
            request.destroy();
        }
    });

    return { registry };
}