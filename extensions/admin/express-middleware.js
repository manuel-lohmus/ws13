/**
 * express-middleware.js
 *
 * Express middleware adapter for ws13/extensions/admin
 *
 * Usage:
 *   const express = require('express');
 *   const { createAdmin } = require('ws13/extensions/admin');
 *   const admin = createAdmin(registry, { authorize, requireRole });
 *   const adminMw = require('ws13/extensions/admin/express-middleware')(admin);
 *
 *   app.use('/admin', adminMw); // mounts admin endpoints under /admin
 *
 * Behavior:
 * - GET  /connections?page=1&perPage=50&filter={"role":"admin"}
 * - GET  /summary
 * - GET  /export.csv?filter={"ip":"1.2.3.4"}
 * - POST /disconnect    { "ip": "1.2.3.4" }
 *
 * The middleware will call admin.httpHandler internally, but provides:
 * - req.adminCtx: { user, token } if your app sets req.user or req.headers['authorization']
 * - Parses JSON 'filter' query param when present
 * - Accepts JSON body for POST /disconnect
 */

"use strict";

module.exports = function createExpressAdminMiddleware(admin, opts = {}) {

    if (!admin || typeof admin.httpHandler !== 'function') {
        throw new TypeError('createExpressAdminMiddleware: admin must be an admin API created by createAdmin(...)');
    }

    const defaultOptions = Object.assign({
        // function(req) => ctx object passed to admin.authorize if used
        ctxFromReq: (req) => {
            // extract token from Authorization header if present
            const auth = req.headers && (req.headers.authorization || req.headers['x-admin-token'] || null);
            let token = null;
            if (typeof auth === 'string') {
                if (auth.startsWith('Bearer ')) token = auth.slice(7).trim();
                else token = auth;
            }
            return { req, token, user: req.user || null };
        },
        // maximum perPage allowed
        maxPerPage: 1000
    }, opts);

    return async function expressAdminMiddleware(req, res, next) {

        // normalize path relative to mount point
        const pathname = req.path || req.url || '/';
        const route = pathname.replace(/\/+$/, '') || '/';

        // build a simple wrapper that delegates to admin.httpHandler with extracted ctx
        // prepare a fake req.url that includes query params
        // express provides req.originalUrl which includes mount; use req.originalUrl to keep query string
        const fakeReq = Object.create(req);
        fakeReq.url = req.originalUrl || req.url || req.path || '/';
        // parse filter query param if present (stringified JSON)
        if (req.query && typeof req.query.filter === 'string') {
            try {
                req.query.filter = JSON.parse(req.query.filter);
            } catch (_) {
                // ignore parse errors; leave as string
            }
        }

        // for POST /disconnect accept JSON body { ip: 'x' }
        if (req.method === 'POST' && (route === '/disconnect' || route === '/disconnect/')) {
            // ensure body parser is used upstream; if not, try to parse raw body
            if (!req.body) {
                // attempt to parse small JSON body manually
                try {
                    let raw = '';
                    req.setEncoding('utf8');
                    for await (const chunk of req) raw += chunk;
                    if (raw) req.body = JSON.parse(raw);
                } catch (_) {
                    req.body = {};
                }
            }
        }

        // prepare context for RBAC/authorize
        const ctx = defaultOptions.ctxFromReq(req);

        // delegate to admin.httpHandler which will run authorize() if configured
        // The admin.httpHandler expects (req, res, opts)
        try {
            return admin.httpHandler(fakeReq, res, Object.assign({ token: ctx.token, user: ctx.user }, opts));
        } catch (err) {
            // fallback to sending error
            res.statusCode = 500;
            res.setHeader('content-type', 'text/plain; charset=utf-8');
            res.end(String(err));
        }
    };
};
