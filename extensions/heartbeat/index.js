"use strict";

/**
 * Heartbeat extension for ws13
 *
 * API:
 *   const hb = createHeartbeatManager();
 *   hb.attach(ws, { interval_ms: 30000, timeout_ms: 10000, onTimeout: (ws) => {} });
 *   hb.detach(ws);
 *   hb.ping(ws); // send a ping once
 *   hb.stopAll();
 *
 * Behavior:
 * - When attached, sends pings every interval_ms (unless interval_ms === 0)
 * - Waits for pong within timeout_ms; if timeout, calls onTimeout and detaches socket
 * - Records ws.latency_ms on pong (round-trip time)
 *
 * Assumptions:
 * - ws supports .send(string|Buffer) and emits 'pong' events with optional payload
 * - For server-side ws13 instances, ws.heartbeatInterval_ms can be used as default
 */

function createHeartbeatManager(options = {}) {
    const defaultInterval = Number(options.interval_ms || 30000);
    const defaultTimeout = Number(options.timeout_ms || 10000);

    // internal map: ws -> state
    const map = new WeakMap();

    function now() { return Date.now(); }

    function makeState(ws, opts = {}) {
        return {
            interval_ms: Number(opts.interval_ms ?? ws.heartbeatInterval_ms ?? defaultInterval),
            timeout_ms: Number(opts.timeout_ms ?? defaultTimeout),
            timerId: null,
            waiting: false,
            pingAt: null,
            onTimeout: typeof opts.onTimeout === "function" ? opts.onTimeout : null,
            // optional: count missed pings
            missed: 0,
        };
    }

    function attach(ws, opts = {}) {
        if (!ws || typeof ws.send !== "function") throw new TypeError("attach: ws must be WebSocket-like");
        // avoid double attach
        if (map.has(ws)) return;

        const state = makeState(ws, opts);
        map.set(ws, state);

        // pong handler
        const onPong = function onPong(payload) {
            const st = map.get(ws);
            if (!st) return;
            if (!st.waiting) return;
            const rtt = now() - st.pingAt;
            ws.latency_ms = rtt;
            st.waiting = false;
            st.pingAt = null;
            st.missed = 0;
            // cancel timeout timer if set
            if (st.timerId) {
                clearTimeout(st.timerId);
                st.timerId = null;
            }
            // emit a 'pong' event if ws emits events (preserve behavior)
            if (typeof ws.emit === "function") {
                try { ws.emit("pong", { latency: rtt }); } catch (_) { }
            }
        };

        // store reference for cleanup
        state._onPong = onPong;
        if (typeof ws.on === "function") ws.on("pong", onPong);

        // periodic ping loop
        function scheduleNext() {
            const st = map.get(ws);
            if (!st) return;
            if (!st.interval_ms || st.interval_ms <= 0) return;
            st._intervalTimer = setTimeout(() => {
                // if ws closed, skip
                if (typeof ws.readyState === "number" && ws.readyState !== ws.OPEN) {
                    // cleanup will be performed in detach
                    return;
                }
                // send ping
                ping(ws).catch(() => { });
                // schedule again
                scheduleNext();
            }, st.interval_ms);
        }

        // store interval timer id placeholder
        state._intervalTimer = null;
        scheduleNext();

        // cleanup on close
        const onClose = function onClose() {
            detach(ws);
        };
        state._onClose = onClose;
        if (typeof ws.on === "function") ws.on("close", onClose);

        return ws;
    }

    async function ping(ws, opts = {}) {
        if (!ws || typeof ws.send !== "function") throw new TypeError("ping: ws must be WebSocket-like");
        const st = map.get(ws);
        // If not attached, use ephemeral single-shot ping
        const ephemeral = !st;
        const interval_ms = Number(opts.interval_ms ?? (st ? st.interval_ms : defaultInterval));
        const timeout_ms = Number(opts.timeout_ms ?? (st ? st.timeout_ms : defaultTimeout));
        const onTimeout = typeof opts.onTimeout === "function" ? opts.onTimeout : (st ? st.onTimeout : null);

        // If waiting already, do not start a concurrent ping
        if (st && st.waiting) return Promise.resolve(false);

        return new Promise((resolve, reject) => {
            let timeoutHandle = null;
            let finished = false;
            const sentAt = now();

            // pong listener (for ephemeral ping we add/remove a temporary handler)
            const handlePong = (payload) => {
                if (finished) return;
                finished = true;
                const rtt = now() - sentAt;
                try {
                    ws.latency_ms = rtt;
                } catch (_) { }
                // cleanup
                if (timeoutHandle) { clearTimeout(timeoutHandle); timeoutHandle = null; }
                if (ephemeral) {
                    if (typeof ws.off === "function") ws.off("pong", handlePong);
                } else {
                    const s = map.get(ws);
                    if (s) { s.waiting = false; s.pingAt = null; s.missed = 0; }
                }
                resolve(rtt);
            };

            // timeout handler
            const handleTimeout = () => {
                if (finished) return;
                finished = true;
                if (timeoutHandle) { clearTimeout(timeoutHandle); timeoutHandle = null; }
                if (ephemeral) {
                    if (typeof ws.off === "function") ws.off("pong", handlePong);
                } else {
                    const s = map.get(ws);
                    if (s) { s.waiting = false; s.pingAt = null; s.missed = (s.missed || 0) + 1; }
                }
                // call onTimeout if provided
                try {
                    if (typeof onTimeout === "function") onTimeout(ws);
                } catch (_) { }
                // best-effort close/detach if attached
                if (map.has(ws)) detach(ws);
                resolve(false);
            };

            // bind pong listener
            if (ephemeral) {
                if (typeof ws.on !== "function") return reject(new TypeError("ws does not support events"));
                ws.on("pong", handlePong);
            } else {
                st.waiting = true;
                st.pingAt = sentAt;
                // ensure we don't overwrite existing pong handler - the attach created one
                // but also add an extra listener to capture this ping specifically
                if (typeof ws.on === "function") ws.on("pong", handlePong);
            }

            // send ping payload if supported; prefer string 'ping' so implementations may echo
            try {
                ws.send(typeof opts.payload !== "undefined" ? opts.payload : "ping");
            } catch (err) {
                // immediate failure
                try {
                    if (ephemeral && typeof ws.off === "function") ws.off("pong", handlePong);
                } catch (_) { }
                return reject(err);
            }

            // start timeout countdown
            timeoutHandle = setTimeout(handleTimeout, timeout_ms);
        });
    }

    function detach(ws) {
        const st = map.get(ws);
        if (!st) return false;
        // clear interval timer
        if (st._intervalTimer) {
            try { clearTimeout(st._intervalTimer); } catch (_) { }
            st._intervalTimer = null;
        }
        // clear timeout
        if (st.timerId) {
            try { clearTimeout(st.timerId); } catch (_) { }
            st.timerId = null;
        }
        // remove listeners
        if (typeof ws.off === "function") {
            if (st._onPong) try { ws.off("pong", st._onPong); } catch (_) { }
            if (st._onClose) try { ws.off("close", st._onClose); } catch (_) { }
        } else if (typeof ws.removeListener === "function") {
            if (st._onPong) try { ws.removeListener("pong", st._onPong); } catch (_) { }
            if (st._onClose) try { ws.removeListener("close", st._onClose); } catch (_) { }
        }
        map.delete(ws);
        return true;
    }

    function stopAll() {
        // note: WeakMap does not allow iteration; user must detach individually if they kept references
        // provide a best-effort approach if users passed a list (not implemented here)
        return true;
    }

    return {
        attach,
        detach,
        ping,
        stopAll,
        // expose for testing/inspection
        _has: (ws) => map.has(ws)
    };
}

module.exports = { createHeartbeatManager };
