/**  Copyright (c) 2024, Manuel Lõhmus (MIT License). */

// permessage-deflate extension

var zlib = require('node:zlib');


/**
 * @typedef Options
 * @property {number} level The compression level, can be an integer from 0 to 9, or one of the constants levels.Z_NO_COMPRESSION, levels.Z_BEST_SPEED, levels.Z_BEST_COMPRESSION, or levels.Z_DEFAULT_COMPRESSION
 * @property {number} memLevel How much memory the compressor allocates, can be an integer from 1 to 9, or one of the constants memLevels.Z_MIN_MEMLEVEL, memLevels.Z_MAX_MEMLEVEL, or memLevels.Z_DEFAULT_MEMLEVEL
 * @property {number} strategy Can be one of the constants strategies.Z_FILTERED, strategies.Z_HUFFMAN_ONLY, strategies.Z_RLE, strategies.Z_FIXED, or strategies.Z_DEFAULT_STRATEGY
 * @property {number} maxWindowBits an integer from 8 to 15 inclusive that sets the maximum size of the session's sliding window; a lower window size will be used if requested by the peer
 * @property {boolean} noContextTakeover if true, stops the session reusing a deflate context between messages
 */

/**
 * @typedef WebSocket
 * @property {0} CONNECTING Waiting opening handshake.
 * @property {1} OPEN Opening handshake succeeded. The client and server may message each other.
 * @property {2} CLOSING Waiting closing handshake. Either ws.close() was called or the server sent a Close frame.
 * @property {3} CLOSED The underlying TCP connection is closed.
 * @property {(event)=>void} onopen Fired when a connection with a WebSocket is opened. Also available via the onopen property.
 * @property {(event)=>void} onmessage Fired when data is received through a WebSocket. Also available via the onmessage property.
 * @property {(event)=>void} onping
 * @property {(event)=>void} onpong
 * @property {(event)=>void} onclose Fired when a connection with a WebSocket is closed. Also available via the onclose property
 * @property {(event)=>void} onerror Fired when data is received through a WebSocket. Also available via the onmessage property.
 * @property {string} protocol The protocol accepted by the server, or an empty string if the client did not specify protocols in the WebSocket constructor.
 * @property {0|1|2|3} readyState The connection state. It is one of the constants below.
 * @property {string} ip IP address
 * @property {number} port
 * @property {number} latency_ms Latency describes the amount of delay on a network or Internet connection. Low latency implies that there are no or almost no delays. High latency implies that there are many delays. One of the main aims of improving performance is to reduce latency.
 * @property {(data)=>void} send Enqueues data to be transmitted.
 * @property {()=>void} close Closes the connection.
 * @property {(callback:(latency_ms:number)=>void)=>void} heartbeat
 */

/**
 * @typedef Message
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
 * Implements the permessage-deflate WebSocket protocol extension
 * @param {Options} options
 */
function PermessageDeflate({
    level = levels.Z_DEFAULT_COMPRESSION,
    memLevel = memLevels.Z_DEFAULT_MEMLEVEL,
    strategy = strategies.Z_DEFAULT_STRATEGY,
    maxWindowBits = windowBits.Z_DEFAULT_WINDOWBITS,
    noContextTakeover = false
} = {}) {

    var isRoleOfServer = true,
        client_no_context_takeover = false,
        server_no_context_takeover = false,
        val_client_max_window_bits = windowBits.Z_MAX_WINDOWBITS,
        val_server_max_window_bits = windowBits.Z_MAX_WINDOWBITS,
        inflate = null,
        deflate = null;

    return {

        /**
         * @param {WebSocket} ws
         */
        init: function (ws) { /* initialisation stuff here */ },

        /**
         * Client generate offer
         * @param {(error:Error, extHeaderValue:string)=>void} callback
        */
        generateOffer: function (callback) {

            isRoleOfServer = false;

            var extHeaderValue = ["permessage-deflate"];

            client_no_context_takeover = noContextTakeover;
            if (client_no_context_takeover) { extHeaderValue.push("client_no_context_takeover"); }

            server_no_context_takeover = noContextTakeover;
            if (server_no_context_takeover) { extHeaderValue.push("server_no_context_takeover"); }

            val_client_max_window_bits = maxWindowBits;
            if (val_client_max_window_bits !== windowBits.Z_MAX_WINDOWBITS) {
                extHeaderValue.push(`client_max_window_bits=${val_client_max_window_bits}`);
            }

            val_server_max_window_bits = maxWindowBits;
            if (val_server_max_window_bits !== windowBits.Z_MAX_WINDOWBITS) {
                extHeaderValue.push(`server_max_window_bits=${val_server_max_window_bits}`);
            }

            callback(null, extHeaderValue.join("; "));
        },

        /**
         * Client activate
         * @param {[string]} headers
         * @param {(error:Error, isActivate:boolean)=>void} callback
         */
        activate: function (headers, callback) {

            var offer = headers["sec-websocket-extensions"]
                .split(",")
                .map(val => val.trim())
                .map(val => val)[0];

            client_no_context_takeover = offer.includes("client_no_context_takeover");
            server_no_context_takeover = offer.includes("server_no_context_takeover");
            val_client_max_window_bits = Number(get_max_window_bits("client", offer));
            val_server_max_window_bits = Number(get_max_window_bits("server", offer));

            callback(null, true);
        },

        /**
         * Server generate response
         * @param {[string]} headers
         * @param {(error:Error, extHeaderValue:string)=>void} callback
         */
        generateResponse: function (headers, callback) {

            isRoleOfServer = true;

            if (headers?.["sec-websocket-extensions"]?.includes("permessage-deflate")) {

                var offer = headers["sec-websocket-extensions"]
                    .split(",")
                    .map(val => val.trim())
                    .map(val => val)[0];

                if (offer) {

                    var extHeaderValue = ["permessage-deflate"];

                    client_no_context_takeover = noContextTakeover || offer.includes("client_no_context_takeover");
                    if (client_no_context_takeover) { extHeaderValue.push("client_no_context_takeover"); }

                    server_no_context_takeover = noContextTakeover || offer.includes("server_no_context_takeover");
                    if (server_no_context_takeover) { extHeaderValue.push("server_no_context_takeover"); }

                    val_client_max_window_bits = Math.min(get_max_window_bits("client", offer), maxWindowBits);
                    extHeaderValue.push(`client_max_window_bits=${val_client_max_window_bits}`);

                    val_server_max_window_bits = Math.min(get_max_window_bits("server", offer), maxWindowBits);
                    extHeaderValue.push(`server_max_window_bits=${val_server_max_window_bits}`);

                    return callback(null, extHeaderValue.join("; "));
                }
            }

            callback();
        },

        /**
         * 
         * @param {Message} message
         * @param {(error:Error, message:Message)=>void} callback
         */
        processIncomingMessage: function (message, callback) {

            if (message.isRsv1) {

                var _inflate;

                if (isRoleOfServer && client_no_context_takeover
                    || !isRoleOfServer && server_no_context_takeover) {

                    _inflate = createInflateRaw();
                }
                else {

                    if (!inflate) { inflate = createInflateRaw(); }
                    _inflate = inflate;
                }

                _inflate.cork();
                _inflate.write(message.payload);
                _inflate.write(Buffer.from([0x00, 0x00, 0xff, 0xff]));
                _inflate.uncork();

                _inflate.flush(function () {

                    message.payloadLength = _inflate.length;
                    message.payload = Buffer.concat(_inflate.chunks, _inflate.length);
                    _inflate.chunks = [];
                    _inflate.length = 0;

                    callback(null, message);
                });
            }
            else { callback(null, message); }

            function createInflateRaw() {

                var inflate = zlib.createInflateRaw({
                    windowBits: isRoleOfServer
                        ? val_client_max_window_bits
                        : val_server_max_window_bits
                });

                inflate.chunks = [];
                inflate.length = 0;
                inflate.on('error', function (error) { callback(error, null); });
                inflate.on('data', function (chunk) {

                    inflate.chunks.push(chunk);
                    inflate.length += chunk.length;
                });

                return inflate;
            }
        },

        /**
         * 
         * @param {Message} message
         * @param {(error:Error, message:Message)=>void} callback
         */
        processOutgoingMessage: function (message, callback) {

            if (!message.payloadLength) { return callback(null, message); }

            var _deflate;

            if (!isRoleOfServer && client_no_context_takeover
                || isRoleOfServer && server_no_context_takeover) {

                _deflate = createDeflateRaw();
            }
            else {

                if (!deflate) { deflate = createDeflateRaw(); }
                _deflate = deflate;
            }

            message.isRsv1 = true;

            _deflate.write(message.payload);

            _deflate.flush(zlib.Z_SYNC_FLUSH, function () {

                message.payloadLength = _deflate.length - 4;
                message.payload = Buffer.concat(_deflate.chunks, _deflate.length)
                    .slice(0, message.payloadLength);
                _deflate.chunks = [];
                _deflate.length = 0;

                callback(null, message);
            });


            function createDeflateRaw() {

                var deflate = zlib.createDeflateRaw({
                    windowBits: isRoleOfServer
                        ? val_server_max_window_bits
                        : val_client_max_window_bits,
                    level: level,
                    memLevel: memLevel,
                    strategy: strategy
                });

                deflate.chunks = [];
                deflate.length = 0;
                deflate.on('error', function (error) { callback(error, null); });
                deflate.on('data', function (chunk) {

                    deflate.chunks.push(chunk);
                    deflate.length += chunk.length;
                });

                return deflate;
            }
        },

        /**
         * @param {(error:Error)=>void} callback
         */
        close: function (callback) {

            var err = null;

            if (inflate) {

                try { inflate.close(); } catch (error) { err = error; }
                inflate = null;
            }

            if (deflate) {

                try { deflate.close(); } catch (error) { err = error; }
                deflate = null;
            }

            callback(err);
        }
    };
}


function get_max_window_bits(prefix, offer) {

    var max_window_bits = offer
        .split(";")
        .map(val => val.trim())
        .find(val => val.includes(prefix + "_max_window_bits"));

    if (max_window_bits) {

        var val_max_window_bits = max_window_bits
            .split('=')
            .map(val => val.trim())[1] || '';

        val_max_window_bits = val_max_window_bits.replaceAll('"', '');

        return val_max_window_bits ? val_max_window_bits : windowBits.Z_MAX_WINDOWBITS;
    }

    return windowBits.Z_MAX_WINDOWBITS;
}



/**
 * Compression levels.
 * @enum {number}
 */
var levels = {
    Z_NO_COMPRESSION: 0,
    Z_BEST_SPEED: 1,
    Z_BEST_COMPRESSION: 9,
    Z_DEFAULT_COMPRESSION: -1
};

/**
 * How much memory the compressor allocates
 * @enum {number}
 */
var memLevels = {
    Z_MIN_MEMLEVEL: 1,
    Z_MAX_MEMLEVEL: 9,
    Z_DEFAULT_MEMLEVEL: 8
};

/**
 * Compression strategy.
 * @enum {number}
 */
var strategies = {
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
var windowBits = {
    Z_DEFAULT_WINDOWBITS: 15,
    Z_MAX_WINDOWBITS: 15,
    Z_MIN_WINDOWBITS: 8
}


PermessageDeflate.levels = levels;
PermessageDeflate.memLevels = memLevels;
PermessageDeflate.strategies = strategies;
PermessageDeflate.windowBits = windowBits;

module.exports = PermessageDeflate;