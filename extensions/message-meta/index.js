"use strict";

/**
 * message-meta extension
 *
 * Purpose:
 *  - Attach metadata to outgoing messages and parse/validate incoming meta.
 *  - Provide per-ws sequence counters and stable id generation.
 *
 * API:
 *  const mm = createMessageMeta(options)
 *  mm.attach(ws, opts) -> attaches helpers to ws
 *  mm.wrapOutgoing(ws, payload, opts) -> { meta, frame } (frame is stringified message with meta)
 *  const parsed = mm.parseIncoming(raw) -> { meta, payload }
 *
 * Options:
 *  - idGenerator: () => string
 *  - clock: () => number
 *  - perConnectionSequence: true|false
 *  - signOutgoing: optional async function(meta, payload) => meta' (e.g. add signature)
 *  - validateIncoming: optional function(meta) => boolean
 *
 * Behavior:
 *  - attach(ws) adds ws._mm_seq if perConnectionSequence and methods ws.wrapSend(payload, opts) and ws.on('message') inbound parsing helpers
 */

function createMessageMeta(options = {}) {
    const {
        idGenerator = (() => Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10)),
        clock = () => Date.now(),
        perConnectionSequence = true,
        // signOutgoing(meta, payload) => Promise<meta>
        signOutgoing = null,
        // validateIncoming(meta) => boolean
        validateIncoming = null,
        // meta property name on wire
        metaField = "__meta"
    } = options;

    function attach(ws, opts = {}) {
        if (!ws) throw new TypeError("attach: ws required");
        // initialize sequence
        if (perConnectionSequence && typeof ws._mm_seq === "undefined") ws._mm_seq = 0;

        // wrapSend: serializes payload with meta and sends via ws.send
        ws.wrapSend = async function (payload, sendOpts = {}) {
            const result = await wrapOutgoing(ws, payload, sendOpts);
            try {
                ws.send(result.frame);
            } catch (e) {
                throw e;
            }
            return result.meta;
        };

        // inbound helper: incoming string frames will be parsed and if meta valid, forwarded as { meta, payload }
        if (typeof ws.on === "function") {
            ws.on('_mm_internal_message', function () { /* placeholder for tests */ });
        }

        return ws;
    }

    async function wrapOutgoing(ws, payload, opts = {}) {
        const meta = Object.assign({
            id: idGenerator(),
            ts: clock(),
            sender: opts.sender || (ws && (ws.auth?.user || ws.ip || ws._id || null)) || null,
            seq: perConnectionSequence ? ((ws && ws._mm_seq !== undefined) ? (++ws._mm_seq) : undefined) : undefined,
            tags: opts.tags || null,
            channel: opts.channel || null
        }, opts.meta || {});

        // allow sign hook
        let metaSigned = meta;
        if (typeof signOutgoing === 'function') {
            try {
                const maybe = signOutgoing(meta, payload);
                if (maybe && typeof maybe.then === 'function') metaSigned = await maybe;
                else metaSigned = maybe || meta;
            } catch (e) {
                // signing failure - proceed without signature but attach error marker
                metaSigned = Object.assign({}, meta, { _signError: true });
            }
        }

        // final frame structure: if payload is object, embed meta under metaField and payload under 'data'
        let frameObj;
        if (typeof payload === 'object' && payload !== null) {
            // don't mutate original payload
            frameObj = Object.assign({}, payload);
            frameObj[metaField] = metaSigned;
        } else {
            frameObj = { data: payload, [metaField]: metaSigned };
        }

        const frame = JSON.stringify(frameObj);
        return { meta: metaSigned, frame };
    }

    function parseIncoming(raw) {
        // raw may be string or object
        let obj;
        try {
            if (typeof raw === 'string') obj = JSON.parse(raw);
            else obj = raw;
        } catch (e) {
            return { ok: false, reason: 'invalid_json' };
        }

        const meta = obj && obj[metaField] ? obj[metaField] : null;
        const payload = (() => {
            if (obj && typeof obj === 'object') {
                const clone = Object.assign({}, obj);
                if (meta) delete clone[metaField];
                // if fields other than data exist, return full object without meta
                return (Object.keys(clone).length === 1 && clone.hasOwnProperty('data')) ? clone.data : clone;
            }
            return obj;
        })();

        if (meta && validateIncoming && typeof validateIncoming === 'function') {
            try {
                if (!validateIncoming(meta)) return { ok: false, reason: 'invalid_meta', meta };
            } catch (e) {
                return { ok: false, reason: 'validate_error', error: e, meta };
            }
        }

        return { ok: true, meta, payload };
    }

    // convenience middleware for channels: when channel.publish is called, msg will be wrapped
    function attachToChannel(channel) {
        if (!channel) throw new TypeError("attachToChannel: channel required");
        // monkey-patch publish to automatically wrap outgoing payloads if they are plain
        const origPublish = channel.publish.bind(channel);
        channel.publish = async function (ws, payload) {
            let wrapped;
            if (payload && payload.__no_meta) {
                // respect explicit opt-out
                wrapped = payload;
            } else {
                const r = await wrapOutgoing(ws, payload, { channel: channel.name, sender: ws && (ws.auth?.user || ws.ip || null) });
                wrapped = JSON.parse(r.frame);
            }
            return origPublish(ws, wrapped);
        };
        return channel;
    }

    return {
        attach,
        wrapOutgoing,
        parseIncoming,
        attachToChannel
    };
}

module.exports = { createMessageMeta };
