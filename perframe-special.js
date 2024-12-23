/**  Copyright (c) 2024, Manuel Lõhmus (MIT License). */

// perframe-special extension

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
 * Implements the perframe-special WebSocket protocol extension
 */
function Special() {

    return {

        /**
         * @param {WebSocket} ws
         */
        init: function (ws) { /* initialisation stuff here */ },
        /**
         * @param {Frame} frame
         * @param {(error:Error, frame:Frame)=>void} callback
        */
        processIncomingFrame: function (frame, callback) {

            console.log('IncomingFrame:', frame);
            callback(null, frame);
        },
        /**
         * @param {Frame} frame
         * @param {(error:Error, frame:Frame)=>void} callback
         */
        processOutgoingFrame: function (frame, callback) {

            console.log('OutgoingFrame:', frame);
            callback(null, frame);
        },
        /**
         * @param {(error:Error)=>void} callback
         */
        close: function (callback) {

            console.log(`'perframe-special' extension closed.`);
            callback(null);
        }
    };
}

module.exports = Special;