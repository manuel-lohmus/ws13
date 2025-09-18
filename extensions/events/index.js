"use strict";

/**
 * Simple events extension for ws13
 *
 * Usage:
 *   // attach to a ws instance
 *   const events = createEventAPI();
 *   events.attach(ws);
 *
 *   ws.onEvent('chat:msg', (data, meta) => { ... });
 *   ws.emitEvent('chat:msg', { text: 'hi' });
 *
 * Server-side you can use a manager to attach handlers for all incoming sockets:
 *   const mgr = createEventAPI();
 *   mgr.on('user:join', handler); // global handler
 *   // when new ws connects:
 *   mgr.attach(ws);
 */

function createEventAPI() {
    // global handlers (name -> Set<fn>)
    const handlers = new Map();

    // helper: add global handler
    function on(name, fn) {
        if (!handlers.has(name)) handlers.set(name, new Set());
        handlers.get(name).add(fn);
        return () => handlers.get(name).delete(fn);
    }

    // helper: remove global handler
    function off(name, fn) {
        if (!handlers.has(name)) return;
        handlers.get(name).delete(fn);
    }

    // attach event helpers to ws-like object
    function attach(ws, opts = {}) {
        if (!ws || typeof ws.send !== "function") throw new TypeError("attach: ws must be WebSocket-like");

        // per-socket handlers
        ws._eventHandlers = ws._eventHandlers || new Map();

        // register per-socket handler
        ws.onEvent = function (name, fn) {
            if (!ws._eventHandlers.has(name)) ws._eventHandlers.set(name, new Set());
            ws._eventHandlers.get(name).add(fn);
            return () => ws._eventHandlers.get(name).delete(fn);
        };

        // remove per-socket handler
        ws.offEvent = function (name, fn) {
            if (!ws._eventHandlers.has(name)) return;
            ws._eventHandlers.get(name).delete(fn);
        };

        // send an event over ws
        ws.emitEvent = function (name, data, meta = null) {
            try {
                const payload = JSON.stringify({ event: name, data: data === undefined ? null : data, meta });
                ws.send(payload);
                return true;
            } catch (e) {
                return false;
            }
        };

        // incoming message handler to dispatch event messages
        // if the ws library already delivers 'message' events with parsed objects,
        // this code assumes raw string JSON frames; adapt if your core passes other shapes.
        ws.on && ws.on("message", function (ev) {
            try {
                const raw = ev && ev.data !== undefined ? ev.data : ev;
                if (typeof raw !== "string") return; // only JSON strings expected
                const obj = JSON.parse(raw);
                if (!obj || typeof obj.event !== "string") return;

                const name = obj.event;
                const data = obj.data;
                const meta = obj.meta;

                // invoke per-socket exact handlers
                const callSet = (set) => {
                    for (const fn of Array.from(set || [])) {
                        try { fn.call(ws, data, meta, obj); } catch (_) { }
                    }
                };

                if (ws._eventHandlers.has(name)) callSet(ws._eventHandlers.get(name));

                // support simple prefix wildcard: e.g., "chat:" matches "chat:msg"
                for (const [key, set] of ws._eventHandlers.entries()) {
                    if (key.endsWith("*") && name.startsWith(key.slice(0, -1))) callSet(set);
                }

                // global handlers
                if (handlers.has(name)) callSet(handlers.get(name));
                for (const [key, set] of handlers.entries()) {
                    if (key.endsWith("*") && name.startsWith(key.slice(0, -1))) callSet(set);
                }
            } catch (e) {
                // ignore non-event messages
            }
        });

        // return the ws for chaining
        return ws;
    }

    return { attach, on, off };
}

module.exports = { createEventAPI };
