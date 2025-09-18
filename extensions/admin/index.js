/**
 * Admin extension for ws13 — v1.1.0-admin
 * Minimal, dependency-free admin helpers for registry inspection, simple actions and dashboard listeners.
 *
 * API:
 *   const admin = createAdmin(registry)
 *   admin.getConnections() -> Array<ConnectionInfo>
 *   admin.getSummary() -> { total, open, avgLatency_ms }
 *   admin.exportJSON() -> string
 *   admin.exportCSV() -> string
 *   admin.disconnectByIp(ip) -> number (disconnected count)
 *   admin.registerListener(ws) -> unregister()  // ws is a WebSocket-like object (will receive 'admin:update' messages)
 *   admin.broadcastUpdate(payload)
 *
 * - RBAC hooks: supply `authorize(ctx)` or `requireRole(role)` when creating admin
 * - Pagination & filtering: getConnections({ page, perPage, filter })
 * - registerListener(ws, opts) can require role or run authorize
 */

"use strict";

function createAdmin(registry, options = {}) {
    if (!registry || typeof registry.clients === "undefined") {
        throw new TypeError("createAdmin: registry is required");
    }

    const {
        // authorize: async (ctx) => boolean | sync boolean; ctx = { req, ws, token, user }
        authorize = null,
        // requireRole: string | null — if provided, registerListener and HTTP endpoints require this role
        requireRole = null,
        // how to extract roles from ws: default reads ws.auth.roles (array)
        rolesAccessor = (ws) => ws?.auth?.roles || [],
        historyStore = null,         // NEW
        channelsManager = null       // NEW (optional, for fallback)
    } = options;

    const listeners = new Set();

    function connectionInfo(ws) {
        return {
            ip: ws.ip || "",
            port: ws.port || "",
            url: ws.url || "",
            readyState: (typeof ws.readyState === "number" ? ws.readyState : null),
            latency_ms: (typeof ws.latency_ms === "number" ? ws.latency_ms : null),
            bufferedAmount: (typeof ws.bufferedAmount === "number" ? ws.bufferedAmount : null),
            heartbeatInterval_ms: (typeof ws.heartbeatInterval_ms === "number" ? ws.heartbeatInterval_ms : null),
            authUser: ws.auth?.user || null,
            authRoles: Array.isArray(rolesAccessor(ws)) ? rolesAccessor(ws) : [],
            idle: !!ws._idle,
            lastSeen: ws._lastSeen || null,
            connectedSince: ws._connectedAt || null
        };
    }

    // Utility: filter connections by predicate object { ip, url, readyState, authUser, role }
    function matchFilters(info, filter = {}) {
        if (!filter || typeof filter !== "object") return true;
        if (filter.ip && String(info.ip) !== String(filter.ip)) return false;
        if (filter.url && String(info.url) !== String(filter.url)) return false;
        if (typeof filter.readyState !== "undefined" && info.readyState !== filter.readyState) return false;
        if (filter.authUser && String(info.authUser) !== String(filter.authUser)) return false;
        if (filter.role && (!Array.isArray(info.authRoles) || !info.authRoles.includes(filter.role))) return false;
        return true;
    }

    function allConnections() {
        const out = [];
        for (const ws of registry.clients) out.push(connectionInfo(ws));
        return out;
    }

    // Public: getConnections supports pagination and filter
    function getConnections({ page = 1, perPage = 50, filter = {} } = {}) {
        const all = allConnections().filter((c) => matchFilters(c, filter));
        const total = all.length;
        const pages = Math.max(1, Math.ceil(total / perPage));
        const p = Math.max(1, Math.min(page, pages));
        const offset = (p - 1) * perPage;
        const results = all.slice(offset, offset + perPage);
        return { total, page: p, perPage, pages, results };
    }

    function getSummary() {
        const conns = allConnections();
        const open = conns.filter(c => c.readyState === 1).length;
        const total = conns.length;
        const latencies = conns.map(c => c.latency_ms).filter(v => typeof v === "number");
        const avgLatency_ms = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;
        return { total, open, avgLatency_ms };
    }

    function exportJSON({ filter } = {}) {
        const { results, total, page, perPage, pages } = getConnections({ page: 1, perPage: Number.MAX_SAFE_INTEGER, filter });
        return JSON.stringify({ summary: getSummary(), meta: { total, page, perPage, pages }, connections: results }, null, 2);
    }

    function exportCSV({ filter } = {}) {
        const rows = [];
        const cols = ["ip", "port", "url", "readyState", "latency_ms", "bufferedAmount", "heartbeatInterval_ms", "authUser", "authRoles", "idle", "lastSeen", "connectedSince"];
        rows.push(cols.join(","));
        const { results } = getConnections({ page: 1, perPage: Number.MAX_SAFE_INTEGER, filter });
        for (const c of results) {
            const r = cols.map(k => {
                const v = c[k];
                if (v === null || typeof v === "undefined") return "";
                if (Array.isArray(v)) return `"${v.join(";")}"`;
                return `"${String(v).replace(/"/g, '""')}"`;
            });
            rows.push(r.join(","));
        }
        return rows.join("\n");
    }

    function disconnectByIp(ip) {
        let count = 0;
        for (const ws of Array.from(registry.clients)) {
            if (ws.ip === ip) {
                try { ws.close(4000, "admin:disconnect"); } catch (_) { try { ws.end && ws.end(); } catch (_) { } }
                count++;
            }
        }
        return count;
    }

    // Helper to check RBAC for a given ws or context.
    async function checkAuthorize(ctx) {
        if (!authorize) {
            if (!requireRole) return true;
            // if requireRole but no authorize provided, attempt role check on ws
            const ws = ctx?.ws;
            if (!ws) return false;
            return (Array.isArray(rolesAccessor(ws)) && rolesAccessor(ws).includes(requireRole));
        }
        try {
            const res = authorize(ctx);
            if (res && typeof res.then === "function") return await res;
            return Boolean(res);
        } catch (e) {
            return false;
        }
    }

    // registerListener can optionally require RBAC; returns unregister function
    function registerListener(ws, opts = {}) {
        // opts may include requireRole override or requireAuthCtx { req, token, user }
        if (!ws || typeof ws.send !== "function") throw new TypeError("registerListener: ws must be WebSocket-like");

        const ctx = { ws, req: opts.req, token: opts.token, user: opts.user };
        const requiredRole = opts.requireRole ?? requireRole;

        return Promise.resolve(checkAuthorize(ctx)).then((authorized) => {
            if (!authorized) throw new Error("registerListener: not authorized");

            listeners.add(ws);
            try { ws.send(JSON.stringify({ type: "admin:init", data: { summary: getSummary(), connections: getConnections() } })); } catch (_) { }
            return () => listeners.delete(ws);
        });
    }

    function broadcastUpdate(payload) {
        const msg = JSON.stringify({ type: "admin:update", data: payload });
        for (const ws of Array.from(listeners)) {
            try { ws.send(msg); } catch (_) { listeners.delete(ws); }
        }
    }

    // Convenience HTTP adapter to wire endpoints onto an Express-like handler.
    // handler signature: (req, res) — req may contain query/filter
    function httpHandler(req, res, opts = {}) {
        // opts may include requireRole or ctx extraction
        const ctx = { req, token: opts.token, user: opts.user };
        const requiredRole = opts.requireRole ?? requireRole;

        Promise.resolve(checkAuthorize(ctx)).then((authorized) => {
            if (!authorized) {
                res.statusCode = 403;
                res.end("Forbidden");
                return;
            }

            const urlObj = new URL(req.url, "http://localhost");
            const route = urlObj.pathname;
            const qp = Object.fromEntries(urlObj.searchParams.entries());

            if (route === "/admin/connections") {
                const page = Math.max(1, parseInt(qp.page || "1", 10));
                const perPage = Math.max(1, Math.min(1000, parseInt(qp.perPage || "50", 10)));
                const filter = qp.filter ? JSON.parse(qp.filter) : {};
                const payload = getConnections({ page, perPage, filter });
                res.setHeader("content-type", "application/json");
                res.end(JSON.stringify(payload));
                return;
            }

            if (route === "/admin/summary") {
                res.setHeader("content-type", "application/json");
                res.end(JSON.stringify(getSummary()));
                return;
            }

            if (route === "/admin/export.csv") {
                const filter = qp.filter ? JSON.parse(qp.filter) : {};
                res.setHeader("content-type", "text/csv");
                res.end(exportCSV({ filter }));
                return;
            }

            if (route.startsWith("/admin/disconnect")) {
                const ip = qp.ip || (route.split("/").pop());
                const count = disconnectByIp(ip);
                res.setHeader("content-type", "application/json");
                res.end(JSON.stringify({ disconnected: count }));
                return;
            }

            if (route === "/admin/channel-history") {
                const qp = Object.fromEntries(urlObj.searchParams.entries());
                const channel = qp.channel;
                if (!channel) { res.statusCode = 400; res.end('Missing channel'); return; }
                const filter = qp.filter ? JSON.parse(qp.filter) : undefined;
                const items = exportChannelHistory({ channel, filter });
                res.setHeader("content-type", "application/json");
                res.end(JSON.stringify({ channel, items }));
                return;
            }

            if (route === "/admin/channel-history.csv") {
                const qp = Object.fromEntries(urlObj.searchParams.entries());
                const channel = qp.channel;
                if (!channel) { res.statusCode = 400; res.end('Missing channel'); return; }
                const filter = qp.filter ? JSON.parse(qp.filter) : undefined;
                const items = exportChannelHistory({ channel, filter });

                // Build CSV header including meta fields if present
                // We'll attempt to detect meta fields from first item
                let metaKeys = [];
                if (items.length > 0) {
                    const sample = items[0];
                    const payload = sample.payload !== undefined ? sample.payload : sample;
                    // meta may be nested under payload.__meta or at top-level sample.payload.__meta
                    const metaObj = (payload && payload.__meta) ? payload.__meta : (sample.__meta ? sample.__meta : null);
                    if (metaObj && typeof metaObj === 'object') metaKeys = Object.keys(metaObj);
                }

                // fixed columns: ts, channel, payload_json, then dynamic meta columns
                const header = ['timestamp', 'channel', 'payload_json'].concat(metaKeys.map(k => `meta_${k}`));
                const rows = [header.join(',')];

                for (const it of items) {
                    const ts = it.ts || (it.payload && it.payload.timestamp) || '';
                    const payload = it.payload !== undefined ? it.payload : it;
                    // remove __meta from payload copy for payload_json column
                    const pCopy = (payload && typeof payload === 'object') ? Object.assign({}, payload) : payload;
                    let meta = null;
                    if (pCopy && pCopy.__meta) { meta = pCopy.__meta; delete pCopy.__meta; }
                    // prepare CSV-safe values
                    const payloadStr = JSON.stringify(pCopy).replace(/"/g, '""');
                    const row = [ts, channel, `"${payloadStr}"`];
                    for (const mk of metaKeys) {
                        const v = meta && (meta[mk] !== undefined) ? String(meta[mk]) : '';
                        row.push(`"${v.replace(/"/g, '""')}"`);
                    }
                    rows.push(row.join(','));
                }

                res.setHeader("content-type", "text/csv");
                res.end(rows.join('\n'));
                return;
            }


            res.statusCode = 404;
            res.end("Not Found");
        }).catch(err => {
            res.statusCode = 500;
            res.end(String(err));
        });
    }

    function exportChannelHistory({ channel, filter } = {}) {
        if (!channel) throw new TypeError('channel required');
        // try historyStore
        if (historyStore && typeof historyStore.list === 'function') {
            return historyStore.list(channel, { limit: Number.MAX_SAFE_INTEGER, filter });
        }
        // fallback to channelsManager's channel.history (if present)
        if (channelsManager && typeof channelsManager.getChannel === 'function') {
            const ch = channelsManager.getChannel(channel);
            if (ch) {
                // normalize to {ts, payload} shape if ch.history is array of wrapped items
                if (Array.isArray(ch.history)) {
                    return ch.history.map(h => ({ ts: h.timestamp || h.ts || Date.now(), payload: h.payload || h }));
                }
            }
        }
        return [];
    }

    return {
        getConnections,
        getSummary,
        exportJSON,
        exportCSV,
        disconnectByIp,
        registerListener,
        broadcastUpdate,
        httpHandler // express-like convenience handler
    };
}

module.exports = { createAdmin };
