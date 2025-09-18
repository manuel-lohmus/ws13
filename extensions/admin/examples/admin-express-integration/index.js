const express = require('express');
const http = require('http');
const createWebSocket = require('../../../../core');
const { createAdmin } = require('../../index');
const createAdminMw = require('../../express-middleware');

const app = express();
app.use(express.json()); // recommended upstream body parser

const server = http.createServer(app);
const { registry } = createWebSocket.attachServer(server, {
    onConnect(ws, req) {
        // map a demo token to roles
        try {
            const q = new URL(req.url, `http://${req.headers.host}`).searchParams;
            const token = q.get('token');
            if (token === 'alice-token') ws.auth = { user: 'alice', roles: ['admin'] };
            if (token === 'bob-token') ws.auth = { user: 'bob', roles: ['user'] };
            ws._connectedAt = Date.now();
        } catch (_) { }
    }
});

const admin = createAdmin(registry, {
    authorize: async (ctx) => {
        // HTTP endpoints: accept header x-admin-token === 'super-secret'
        if (ctx.req && ctx.req.headers && ctx.req.headers['x-admin-token'] === 'super-secret') return true;
        // WS: if ws.auth.roles contains admin
        if (ctx.ws && ctx.ws.auth && (ctx.ws.auth.roles || []).includes('admin')) return true;
        return false;
    },
    requireRole: 'admin'
});

const adminMw = createAdminMw(admin);

// mount under /admin
app.use('/admin', adminMw);

// optionally mount static dashboard
app.get('/admin/ui', (req, res) => {
    res.sendFile(require('path').join(__dirname, 'admin-dashboard.html'));
});

server.listen(8080, () => console.log('Express admin example running on http://localhost:8080/admin'));
