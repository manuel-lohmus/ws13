/**  Copyright (c) Manuel Lõhmus (MIT License). */

// permessage-deflate extension
"use strict";

const zlib = require('node:zlib');

/**
 * @typedef Options
 * @property {number} level
 * @property {number} memLevel
 * @property {number} strategy
 * @property {number} maxWindowBits
 * @property {boolean} noContextTakeover
 * @property {number} maxDecompressSize Maximum allowed decompressed message size in bytes (default 16MB)
 */

/**
 * Implements the permessage-deflate WebSocket protocol extension (RFC 7692)
 * @param {Options} options
 * @returns {Extension}
 */
function createPermessageDeflate({
    level = levels.Z_DEFAULT_COMPRESSION,
    memLevel = memLevels.Z_DEFAULT_MEMLEVEL,
    strategy = strategies.Z_DEFAULT_STRATEGY,
    maxWindowBits = windowBits.Z_DEFAULT_WINDOWBITS,
    noContextTakeover = false,
    maxDecompressSize = 16 * 1024 * 1024
} = {}) {

    if (createPermessageDeflate === this?.constructor) {
        throw new Error('This function must be used without the `new` keyword.');
    }

    let isRoleOfServer = true, // set in generateOffer/generateResponse/activate
        client_no_context_takeover = false,
        server_no_context_takeover = false,
        val_client_max_window_bits = windowBits.Z_MAX_WINDOWBITS,
        val_server_max_window_bits = windowBits.Z_MAX_WINDOWBITS,
        inflate = null,
        inflateQueue = [],
        deflate = null,
        deflateQueue = [];

    return {
        init: function (_ws) { /* optional init hook */ },

        generateOffer: function (callback) {

            isRoleOfServer = false;

            const extHeaderValue = ["permessage-deflate"];

            client_no_context_takeover = !!noContextTakeover;
            if (client_no_context_takeover) extHeaderValue.push("client_no_context_takeover");

            server_no_context_takeover = !!noContextTakeover;
            if (server_no_context_takeover) extHeaderValue.push("server_no_context_takeover");

            val_client_max_window_bits = asValidWindowBits(maxWindowBits);
            if (val_client_max_window_bits !== windowBits.Z_MAX_WINDOWBITS) {
                extHeaderValue.push(`client_max_window_bits=${val_client_max_window_bits}`);
            }

            val_server_max_window_bits = asValidWindowBits(maxWindowBits);
            if (val_server_max_window_bits !== windowBits.Z_MAX_WINDOWBITS) {
                extHeaderValue.push(`server_max_window_bits=${val_server_max_window_bits}`);
            }

            callback(null, extHeaderValue.join("; "));
        },

        activate: function (headers, callback) {

            // client-side: parse server response
            isRoleOfServer = false;

            const header = headers["sec-websocket-extensions"] || '',
                offer = header.split(",").map(v => v.trim()).find(v => v.startsWith("permessage-deflate")) || '';

            client_no_context_takeover = offer.includes("client_no_context_takeover");
            server_no_context_takeover = offer.includes("server_no_context_takeover");
            val_client_max_window_bits = asValidWindowBits(get_max_window_bits("client", offer));
            val_server_max_window_bits = asValidWindowBits(get_max_window_bits("server", offer));

            callback(null, true);
        },

        generateResponse: function (headers, callback) {

            isRoleOfServer = true;

            if (headers?.["sec-websocket-extensions"]?.includes("permessage-deflate")) {
                const offer = headers["sec-websocket-extensions"]
                    .split(",").map(v => v.trim())
                    .find(v => v.startsWith("permessage-deflate"));

                if (offer) {
                    const extHeaderValue = ["permessage-deflate"];

                    client_no_context_takeover = !!noContextTakeover || offer.includes("client_no_context_takeover");
                    if (client_no_context_takeover) extHeaderValue.push("client_no_context_takeover");

                    server_no_context_takeover = !!noContextTakeover || offer.includes("server_no_context_takeover");
                    if (server_no_context_takeover) extHeaderValue.push("server_no_context_takeover");

                    // Negotiate window bits: choose min(requested, configured)
                    const req_client_bits = asValidWindowBits(get_max_window_bits("client", offer)),
                        req_server_bits = asValidWindowBits(get_max_window_bits("server", offer));

                    val_client_max_window_bits = Math.min(req_client_bits, asValidWindowBits(maxWindowBits));
                    val_server_max_window_bits = Math.min(req_server_bits, asValidWindowBits(maxWindowBits));

                    extHeaderValue.push(`client_max_window_bits=${val_client_max_window_bits}`);
                    extHeaderValue.push(`server_max_window_bits=${val_server_max_window_bits}`);

                    return callback(null, extHeaderValue.join("; "));
                }
            }
            callback();
        },

        processIncomingMessage: function (frame, callback) {

            inflateQueue.push([frame, callback]);
            inflateProcess();

            return;


            function inflateProcess() {

                if (inflateQueue.isWorking) { return; }
                if (!inflateQueue.length) { return; }

                inflateQueue.isWorking = true;

                const [frame, callback] = inflateQueue.shift();

                // Only decompress if RSV1 is set
                if (!frame.isRsv1) { return doneCallback(null, frame); }
                if (!frame.payloadLength) { return doneCallback(null, frame); }

                const useNewInflate = (isRoleOfServer && client_no_context_takeover)
                    || (!isRoleOfServer && server_no_context_takeover);

                let _inflate = null;

                if (useNewInflate) {
                    _inflate = createInflateRaw();
                }
                else {
                    if (!inflate) {
                        inflate = createInflateRaw();
                    }
                    _inflate = inflate;
                }

                // Append RFC tail 0x00 0x00 0xFF 0xFF
                let aborted = false;
                let total = 0;
                const chunks = [];

                _inflate.on('error', onError);
                _inflate.on('data', onData);

                if (_inflate.isPaused()) { _inflate.resume(); }

                _inflate.write(frame.payload);
                _inflate.write(Buffer.from([0x00, 0x00, 0xff, 0xff]));
                _inflate.flush(onFlush);

                return;


                function createInflateRaw() {

                    const ibits = isRoleOfServer ? val_client_max_window_bits : val_server_max_window_bits;
                    return zlib.createInflateRaw({ windowBits: ibits });
                }
                function onError(error) {

                    aborted = true;
                    cleanup(function () {
                        doneCallback(error, null);
                    });
                }
                function onData(chunk) {

                    total += chunk.length;

                    if (total > maxDecompressSize) {
                        onError(new Error('permessage-deflate: decompressed message too large'));
                        try { _inflate.close(); } catch (_) { }
                        return;
                    }
                    chunks.push(chunk);
                }
                function onFlush() {

                    if (aborted) return;

                    frame.payloadLength = total;
                    frame.payload = Buffer.concat(chunks, total);
                    cleanup(function () {
                        doneCallback(null, frame);
                    });
                }
                function cleanup(cb) {

                    _inflate.pause();
                    _inflate.removeListener('error', onError);
                    _inflate.removeListener('data', onData);

                    if (useNewInflate) { _inflate.close(cb); }

                    _inflate = null;
                    cb();
                }
                function doneCallback(err, frame) {

                    callback(err, frame);
                    inflateQueue.isWorking = false;
                    Promise.resolve(1).then(inflateProcess);
                }
            }
        },

        processOutgoingMessage: function (frame, callback) {

            deflateQueue.push([frame, callback]);
            deflateProcess();

            return;


            function deflateProcess() {

                if (deflateQueue.isWorking) { return; }
                if (!deflateQueue.length) { return; }

                deflateQueue.isWorking = true;

                const [frame, callback] = deflateQueue.shift(),
                    useNewDeflate = (!isRoleOfServer && client_no_context_takeover)
                        || (isRoleOfServer && server_no_context_takeover);
                let _deflate = null;

                if (!frame.payloadLength) { return doneCallback(null, frame); }

                if (useNewDeflate) {
                    _deflate = createDeflateRaw();
                }
                else {
                    if (!deflate) {
                        deflate = createDeflateRaw();
                    }
                    _deflate = deflate;
                }

                frame.isRsv1 = true;
                let total = 0;
                const chunks = [];

                _deflate.on('error', onError);
                _deflate.on('data', onData);

                if (_deflate.isPaused()) { _deflate.resume(); }

                _deflate.write(frame.payload);
                _deflate.flush(zlib.constants.Z_SYNC_FLUSH, onFlush);

                return;


                function createDeflateRaw() {

                    const wbits = isRoleOfServer ? val_server_max_window_bits : val_client_max_window_bits;

                    return zlib
                        .createDeflateRaw({
                            windowBits: wbits,
                            level, memLevel, strategy
                        });
                }
                function onError(error) {

                    cleanup(function () {
                        doneCallback(error, null);
                    });
                }
                function onData(chunk) {

                    total += chunk.length;
                    chunks.push(chunk);
                }
                function onFlush() {

                    // Z_SYNC_FLUSH adds 4-byte tail we must drop
                    const outLen = Math.max(0, total - 4),
                        out = Buffer.concat(chunks, total).subarray(0, outLen);
                    frame.payloadLength = out.length;
                    frame.payload = out;
                    cleanup(function () {
                        doneCallback(null, frame);
                    });
                }
                function cleanup(cb) {

                    _deflate.pause();
                    _deflate.removeListener('error', onError);
                    _deflate.removeListener('data', onData);

                    if (useNewDeflate) { _deflate.close(cb); }

                    _deflate = null;
                    cb();
                }
                function doneCallback(err, frame) {

                    callback(err, frame);
                    deflateQueue.isWorking = false;
                    Promise.resolve(1).then(deflateProcess);
                }
            }
        },

        close: function (callback) {

            let err = null;

            if (inflate) { try { inflate.close(); } catch (e) { err = e; } inflate = null; }
            if (deflate) { try { deflate.close(); } catch (e) { err = e; } deflate = null; }

            callback(err);
        }
    };


    function asValidWindowBits(n, fallback = windowBits.Z_MAX_WINDOWBITS) {

        const v = Number(n);

        if (!Number.isFinite(v)) return fallback;

        return Math.min(windowBits.Z_MAX_WINDOWBITS, Math.max(windowBits.Z_MIN_WINDOWBITS, v));
    }
}

function get_max_window_bits(prefix, offer) {

    const item = String(offer || '')
        .split(";")
        .map(v => v.trim())
        .find(v => v.startsWith(prefix + "_max_window_bits"));

    if (!item) return windowBits.Z_MAX_WINDOWBITS;

    const val = item.split('=').map(v => v.trim())[1] || '',
        num = Number(String(val).replaceAll('"', ''));

    if (!Number.isFinite(num)) return windowBits.Z_MAX_WINDOWBITS;

    const clamped = Math.min(windowBits.Z_MAX_WINDOWBITS, Math.max(windowBits.Z_MIN_WINDOWBITS, num));

    return clamped;
}

/**
 * Compression levels.
 * @enum {number}
 */
const levels = {
    Z_NO_COMPRESSION: 0,
    Z_BEST_SPEED: 1,
    Z_BEST_COMPRESSION: 9,
    Z_DEFAULT_COMPRESSION: -1
};

/**
 * How much memory the compressor allocates
 * @enum {number}
 */
const memLevels = {
    Z_MIN_MEMLEVEL: 1,
    Z_MAX_MEMLEVEL: 9,
    Z_DEFAULT_MEMLEVEL: 8
};

/**
 * Compression strategy.
 * @enum {number}
 */
const strategies = {
    Z_FILTERED: 1,
    Z_HUFFMAN_ONLY: 2,
    Z_RLE: 3,
    Z_FIXED: 4,
    Z_DEFAULT_STRATEGY: 0
};

/**
 * Sliding window bits.
 * @enum {number}
 */
const windowBits = {
    Z_DEFAULT_WINDOWBITS: 15,
    Z_MAX_WINDOWBITS: 15,
    Z_MIN_WINDOWBITS: 8
};

createPermessageDeflate.levels = levels;
createPermessageDeflate.memLevels = memLevels;
createPermessageDeflate.strategies = strategies;
createPermessageDeflate.windowBits = windowBits;

module.exports = createPermessageDeflate;
