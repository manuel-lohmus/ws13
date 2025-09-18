"use strict";

/**
 * routing extension for ws13 — integrated with message-meta when provided
 *
 * See earlier docs for router rules. New: pass { messageMeta } option to createRouter
 * to enable automatic parsing/wrapping of messages with meta.
 */

function createRouter(options = {}) {
    const rules = Array.isArray(options.rules) ? options.rules.slice() : [];
    const onRoute = typeof options.onRoute === "function" ? options.onRoute : null;
    const defaultMetaField = options.metaField || "__meta";
    const messageMeta = options.messageMeta || null; // message-meta instance (createMessageMeta())

    function addRule(rule) {
        if (!rule || typeof rule !== "object") throw new TypeError("rule must be object");
        if (!rule.name) rule.name = `rule-${rules.length + 1}`;
        rules.push(rule);
        return () => {
            const i = rules.indexOf(rule);
            if (i >= 0) rules.splice(i, 1);
        };
    }

    function listRules() {
        return rules.map(r => Object.assign({}, r));
    }

    function matchRule(rule, payload, meta, ctx) {
        if (!rule) return false;
        if (rule.match) {
            const m = rule.match;
            if (m.prefix) {
                const asStr = (typeof payload === "string") ? payload : (payload && payload.topic) || '';
                if (!String(asStr).startsWith(m.prefix)) return false;
            }
            if (m.topic) {
                const t = (payload && payload.topic) || null;
                if (t !== m.topic) return false;
            }
            if (m.meta) {
                if (!meta) return false;
                for (const k of Object.keys(m.meta)) {
                    if (meta[k] !== m.meta[k]) return false;
                }
            }
            if (typeof m.predicate === "function") {
                try {
                    const ok = m.predicate(payload, meta, ctx);
                    if (typeof ok.then === "function") {
                        return { async: true };
                    }
                    if (!ok) return false;
                } catch (e) { return false; }
            }
        }
        return true;
    }

    async function matchRuleAsync(rule, payload, meta, ctx) {
        if (!rule) return false;
        if (rule.match) {
            const m = rule.match;
            if (m.prefix) {
                const asStr = (typeof payload === "string") ? payload : (payload && payload.topic) || '';
                if (!String(asStr).startsWith(m.prefix)) return false;
            }
            if (m.topic) {
                const t = (payload && payload.topic) || null;
                if (t !== m.topic) return false;
            }
            if (m.meta) {
                if (!meta) return false;
                for (const k of Object.keys(m.meta)) {
                    if (meta[k] !== m.meta[k]) return false;
                }
            }
            if (typeof m.predicate === "function") {
                try {
                    const ok = m.predicate(payload, meta, ctx);
                    if (typeof ok.then === "function") return !!(await ok);
                    return !!ok;
                } catch (e) { return false; }
            }
        }
        return true;
    }

    async function handle(raw, ctx = {}) {
        const metaField = ctx.metaField || defaultMetaField;

        // decode incoming using messageMeta if available
        let payload = raw;
        let meta = null;

        if (messageMeta && typeof messageMeta.parseIncoming === "function") {
            const parsed = messageMeta.parseIncoming(raw);
            if (parsed && parsed.ok) {
                payload = parsed.payload;
                meta = parsed.meta;
            } else {
                // if parseIncoming returned not-ok, still carry raw payload so rules can decide
                payload = parsed.payload !== undefined ? parsed.payload : raw;
                meta = parsed.meta || null;
            }
        } else {
            // fallback: manual parse JSON and extract metaField
            try {
                if (typeof raw === "string") {
                    const o = JSON.parse(raw);
                    if (o && typeof o === "object" && o[metaField]) {
                        meta = o[metaField];
                        const clone = Object.assign({}, o);
                        delete clone[metaField];
                        payload = (Object.keys(clone).length === 1 && clone.hasOwnProperty('data')) ? clone.data : clone;
                    } else {
                        payload = o;
                    }
                }
            } catch (e) {
                payload = raw;
            }
        }

        for (const rule of rules) {
            const mres = matchRule(rule, payload, meta, ctx);
            if (mres === false) continue;
            if (mres && mres.async) {
                const ok = await matchRuleAsync(rule, payload, meta, ctx);
                if (!ok) continue;
            }

            const act = rule.action || { type: "drop" };
            const info = { rule: rule.name, action: act, matched: true };

            if (act.type === "transform" && typeof act.fn === "function") {
                try {
                    const res = act.fn(payload, meta, ctx);
                    const applied = (res && typeof res.then === "function") ? await res : res;
                    payload = applied && applied.payload !== undefined ? applied.payload : payload;
                    meta = applied && applied.meta !== undefined ? applied.meta : meta;
                    if (typeof onRoute === "function") onRoute(info, ctx);
                    continue;
                } catch (e) {
                    if (typeof onRoute === "function") onRoute(Object.assign({}, info, { error: e }), ctx);
                    return { action: "error", error: e, info };
                }
            }

            if (act.type === "channel" && ctx.channelsManager && typeof ctx.channelsManager.getChannel === "function") {
                const ch = ctx.channelsManager.getChannel(act.channel);
                if (!ch) {
                    if (typeof onRoute === "function") onRoute(Object.assign({}, info, { error: new Error("channel_not_found") }), ctx);
                    return { action: "error", error: new Error("channel_not_found"), info };
                }
                try {
                    // If we have a messageMeta instance, use it to wrap outgoing message including meta
                    if (messageMeta && typeof messageMeta.wrapOutgoing === "function") {
                        // Build outgoing payload object (do not mutate original payload)
                        const toSendPayload = (typeof payload === "object" && payload !== null) ? Object.assign({}, payload) : { data: payload };
                        // include existing meta if present
                        if (meta) toSendPayload[metaField] = meta;
                        // wrapOutgoing returns { meta, frame } where frame is a string
                        const wrapped = await messageMeta.wrapOutgoing(ctx.ws, toSendPayload, { channel: act.channel });
                        // ch.broadcast expects payload (we send parsed object so members get JSON)
                        // If ch.broadcast expects to JSON.stringify internally, send parsed object: JSON.parse(wrapped.frame)
                        try {
                            const parsedFrame = JSON.parse(wrapped.frame);
                            ch.broadcast(parsedFrame, { sender: ctx.ws });
                        } catch (e) {
                            // fallback: send frame string directly to each member
                            for (const m of Array.from(ch.members)) {
                                try {
                                    if (m && typeof m.send === "function") m.send(wrapped.frame);
                                } catch (_) { try { ch.remove(m); } catch (_) { } }
                            }
                        }
                    } else {
                        // no messageMeta: embed metaField if meta present
                        const outPayload = (meta && typeof payload === "object") ? Object.assign({}, payload, { [metaField]: meta }) : payload;
                        ch.broadcast(outPayload, { sender: ctx.ws });
                    }

                    if (typeof onRoute === "function") onRoute(info, ctx);
                    return { action: "channel", channel: act.channel, info };
                } catch (e) {
                    if (typeof onRoute === "function") onRoute(Object.assign({}, info, { error: e }), ctx);
                    return { action: "error", error: e, info };
                }
            }

            if (act.type === "forward" && typeof act.to === "function") {
                try {
                    const res = act.to(payload, meta, ctx);
                    if (res && typeof res.then === "function") await res;
                    if (typeof onRoute === "function") onRoute(info, ctx);
                    return { action: "forward", info };
                } catch (e) {
                    if (typeof onRoute === "function") onRoute(Object.assign({}, info, { error: e }), ctx);
                    return { action: "error", error: e, info };
                }
            }

            if (act.type === "drop") {
                if (typeof onRoute === "function") onRoute(info, ctx);
                return { action: "drop", info };
            }

            if (typeof onRoute === "function") onRoute(Object.assign({}, info, { warning: "unknown_action" }), ctx);
            return { action: "noop", info };
        }

        return { action: "noop", info: null };
    }

    function attachToSocket(ws, opts = {}) {
        if (!ws || typeof ws.on !== "function") throw new TypeError("attachToSocket: ws must support on(event, fn)");
        const ctxBase = Object.assign({}, opts);
        // if messageMeta provided, attach it to ws for helper methods
        if (messageMeta && typeof messageMeta.attach === "function") {
            try { messageMeta.attach(ws); } catch (_) { }
            // add helper to reply preserving meta: ws.replyMeta(responsePayload, replyMetaOpts)
            ws.replyMeta = async function (responsePayload, replyOpts = {}) {
                if (!ws || typeof ws.send !== "function") return false;
                try {
                    const wrapped = await messageMeta.wrapOutgoing(ws, responsePayload, replyOpts);
                    ws.send(wrapped.frame);
                    return true;
                } catch (e) { return false; }
            };
        }

        const handler = function (ev) {
            const ctx = Object.assign({ ws }, ctxBase);
            Promise.resolve(handle(ev && ev.data !== undefined ? ev.data : ev, ctx)).catch(() => { });
        };
        ws.__routing_on_message = handler;
        ws.on("message", handler);
        return () => {
            try { if (ws && typeof ws.off === "function") ws.off("message", handler); } catch (_) { }
            try { delete ws.__routing_on_message; } catch (_) { }
            try { delete ws.replyMeta; } catch (_) { }
        };
    }

    return { addRule, listRules, handle, attachToSocket, matchRule };
}

module.exports = { createRouter };
