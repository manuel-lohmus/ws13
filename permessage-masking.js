/**  Copyright (c) 2024, Manuel Lõhmus (MIT License). */

// fast-perframe-masking extension

/**
 * @typedef Frame
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
 * Implements the fast-permessage-masking WebSocket protocol extension
 */
function createMasking() {

    if (createMasking === this.constructor) { throw new Error('This function must be used without the `new` keyword.'); }

    return {

        /**
         * @param {WebSocket} ws
         */
        init: function (ws) { /* initialisation stuff here */ },

        /**
         * @param {Frame} frame
         * @param {(error:Error, frame:Frame)=>void} callback
         */
        mask: function (frame, callback) {

            for (var i = 0, n = frame.payloadLength; i < n; i++) {

                frame.payload[i] = frame.payload[i] ^ frame.maskingKey[i & 3];
            }

            callback(null, frame);
        },

        /**
         * @param {Frame} frame
         * @param {(error:Error, frame:Frame)=>void} callback
         */
        unmask: function (frame, callback) {

            for (var i = 0, n = frame.payloadLength; i < n; i++) {

                frame.payload[i] = frame.payload[i] ^ frame.maskingKey[i & 3];
            }

            callback(null, frame);
        },

        /**
         * @param {(error:Error)=>void} callback
         */
        close: function (callback) { callback(null); }
    };
}

module.exports = createMasking;