/**
 * Minimal auth extension for ws13
 *
 * Purpose:
 *  - Provide token-based authentication helpers for ws13 attachServer workflows
 *  - Provide convenient verifyToken and requireRole hooks
 *  - Attach auth info onto ws.auth = { user, roles, meta }
 *  - attachAuthToServer(server, auth, attachServerOptions)
 *  - jwtVerifier(secretOrPublicKey, options)
 *
 * API:
 *  const auth = createAuth(options)
 *  auth.verifyToken(token) -> { ok: boolean, user?, roles?, meta? } | Promise<...>
 *  auth.requireRole(role, ws) -> boolean | Promise<boolean>
 *  auth.wsAuthenticate(ws, req) -> Promise<boolean> // extracts token from query/header and sets ws.auth
 *  auth.httpMiddleware() -> (req, res, next) Express-like middleware
 *
 * Usage:
 * const auth = createAuth({ verifier: jwtVerifier(secret) });
 * attachAuthToServer(server, auth, { onConnect: (ws, req) => { ... } });
 */
"use strict";

const { URL } = require('url');

function createAuth(options = {}) {
    const {
        verifier = defaultVerifier(options.tokens || {}),
        roleAccessor = (result) => Array.isArray(result?.roles) ? result.roles : [],
        tokenSources = ['query', 'header'],
        headerName = 'x-auth-token'
    } = options;

    async function verifyToken(token) {
        if (!token) return { ok: false };
        try {
            const res = await verifier(token);
            if (!res) return { ok: false };
            return Object.assign({ ok: true }, res);
        } catch (e) {
            return { ok: false, error: e };
        }
    }

    async function requireRole(role, wsOrCtx) {
        if (!role) return true;
        const ctx = typeof wsOrCtx === 'object' && wsOrCtx ? wsOrCtx : null;
        if (ctx?.auth && Array.isArray(ctx.auth.roles)) {
            return ctx.auth.roles.includes(role);
        }
        return false;
    }

    function extractTokenFromReq(req) {
        if (!req) return null;
        if (tokenSources.includes('query')) {
            try {
                const rawUrl = req.url || req.path || '';
                const qp = new URL(rawUrl, 'http://localhost').searchParams;
                const t = qp.get('token') || qp.get('auth_token') || qp.get('access_token');
                if (t) return t;
            } catch (_) { /* ignore */ }
        }
        if (tokenSources.includes('header')) {
            const h = req.headers && (req.headers[headerName] || req.headers[headerName.toLowerCase()] || req.headers.authorization);
            if (!h) return null;
            if (typeof h === 'string') {
                if (h.startsWith('Bearer ')) return h.slice(7).trim();
                return String(h).trim();
            }
            return null;
        }
        return null;
    }

    async function wsAuthenticate(ws, req, opts = {}) {
        try {
            let token = opts.token || extractTokenFromReq(req) || (req && req.headers && req.headers[headerName]);
            if (!token && req && req.headers && req.headers.authorization) {
                const a = String(req.headers.authorization);
                if (a.startsWith('Bearer ')) token = a.slice(7).trim();
            }
            const result = await verifyToken(token);
            if (!result || !result.ok) return false;
            const roles = roleAccessor(result) || [];
            ws.auth = { user: result.user || null, roles, meta: result.meta || null };
            return true;
        } catch (_) {
            return false;
        }
    }

    function httpMiddleware(opts = {}) {
        return async function (req, res, next) {
            const token = extractTokenFromReq(req);
            const resv = await verifyToken(token);
            if (!resv || !resv.ok) {
                res.statusCode = 401;
                res.end('Unauthorized');
                return;
            }
            req.user = resv.user || null;
            req.auth = { roles: roleAccessor(resv), meta: resv.meta || null };
            if (typeof next === 'function') return next();
            else return;
        };
    }

    return {
        verifyToken,
        requireRole,
        wsAuthenticate,
        httpMiddleware,
        defaultVerifier
    };
}

// helper: build a simple verifier from map { token: { user, roles } }
function defaultVerifier(map = {}) {
    return async function defaultVerify(token) {
        if (!token) return { ok: false };
        const val = map[token];
        if (!val) return { ok: false };
        return { ok: true, user: val.user || null, roles: val.roles || [], meta: val.meta || null };
    };
}

/**
 * Attach auth to server upgrade flow.
 * - server: http(s) server
 * - auth: object returned by createAuth()
 * - opts: passed to createWebSocket.attachServer as options, plus onAuthFailed(req,socket) optional handler
 *
 * Behaviour:
 * - when upgrade occurs, we createWebSocket({ request }), then call auth.wsAuthenticate(ws, req)
 * - if auth fails, close socket / destroy connection and do not call onConnect
 * - if auth succeeds, call provided onConnect(ws, req)
 */
function attachAuthToServer(server, auth, { createWebSocket, registry = null, onConnect = null, onAuthFailed = null } = {}) {
    if (typeof createWebSocket !== 'function') {
        throw new TypeError('attachAuthToServer requires createWebSocket function in options');
    }

    server.on('upgrade', function (request, socket, head) {
        // create a ws-like instance using createWebSocket
        const ws = createWebSocket({ request });
        if (!ws) {
            try { socket.destroy(); } catch (_) { }
            return;
        }

        // attempt auth
        Promise.resolve(auth.wsAuthenticate(ws, request)).then(ok => {
            if (!ok) {
                try { ws.close && ws.close(4001, 'unauthorized'); } catch (_) { }
                if (typeof onAuthFailed === 'function') {
                    try { onAuthFailed(request, socket); } catch (_) { }
                } else {
                    try { socket.destroy(); } catch (_) { }
                }
                return;
            }

            // auth ok: add to registry if provided or leave to onConnect
            if (registry && typeof registry.add === 'function') {
                registry.add(ws);
            }

            if (typeof onConnect === 'function') {
                try { onConnect(ws, request); } catch (e) { ws.emit && ws.emit('error', e); }
            }
        }).catch(err => {
            try { socket.destroy(); } catch (_) { }
        });
    });

    return server;
}

/**
 * JWT verifier helper
 * - secretOrPublicKey: secret for HMAC or public key for RSA/ECDSA verification
 * - opts: { algorithms: ['HS256','RS256'], ignoreExpiration: false }
 *
 * Returns async function(token) => { ok, user, roles, meta }
 *
 * Implementation uses built-in crypto and minimal base64url decode to avoid adding heavy deps.
 * NOTE: this helper focuses on common HS256 and RS256 usage. For full JWT needs use jsonwebtoken or other vetted library.
 */
function jwtVerifier(secretOrPublicKey, opts = {}) {
    const { algorithms = ['HS256'], ignoreExpiration = false } = opts;

    const crypto = require('node:crypto');

    function base64urlDecode(str) {
        str = String(str).replace(/-/g, '+').replace(/_/g, '/');
        while (str.length % 4) str += '=';
        return Buffer.from(str, 'base64').toString('utf8');
    }

    function verifySignature(headerB64, payloadB64, signatureB64, key, alg) {
        const signingInput = headerB64 + '.' + payloadB64;
        const sig = Buffer.from(signatureB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

        if (alg.startsWith('HS')) {
            const h = crypto.createHmac('sha' + alg.slice(2), key).update(signingInput).digest();
            return crypto.timingSafeEqual(h, sig);
        }
        else if (alg.startsWith('RS') || alg.startsWith('ES')) {
            const verifier = crypto.createVerify('SHA' + alg.slice(2));
            verifier.update(signingInput);
            verifier.end();
            return verifier.verify(key, sig);
        }
        return false;
    }

    return async function verify(token) {
        try {
            if (!token || typeof token !== 'string') return { ok: false };
            const parts = token.split('.');
            if (parts.length !== 3) return { ok: false };
            const [hB64, pB64, sB64] = parts;
            const header = JSON.parse(base64urlDecode(hB64));
            const payload = JSON.parse(base64urlDecode(pB64));
            const alg = header.alg;

            if (!alg || !alg.startsWith('HS') && !alg.startsWith('RS') && !alg.startsWith('ES')) return { ok: false };
            if (alg && algorithms.length && !algorithms.includes(alg)) return { ok: false };

            const sigOk = verifySignature(hB64, pB64, sB64, secretOrPublicKey, alg);
            if (!sigOk) return { ok: false };

            const now = Math.floor(Date.now() / 1000);
            if (!ignoreExpiration && payload.exp && now >= payload.exp) return { ok: false };

            // Accept standard claims; put useful fields into result
            const user = payload.sub || payload.user || null;
            const roles = payload.roles || payload.role || payload.scopes || null;

            return { ok: true, user, roles: Array.isArray(roles) ? roles : (roles ? String(roles).split(',').map(s => s.trim()) : []), meta: payload };
        } catch (e) {
            return { ok: false, error: e };
        }
    };
}

module.exports = { createAuth, defaultVerifier, attachAuthToServer, jwtVerifier };
