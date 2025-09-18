## Notes and recommendations

 - The middleware delegates authorization to admin.httpHandler which itself calls the provided authorize() hook; you can control ctx extraction via ctxFromReq option or set req.user in your upstream auth middleware.

 - Include express.json() (or similar) before mounting this middleware so POST /disconnect and filter bodies are parsed.

 - The middleware is intentionally minimal: it forwards the request to admin.httpHandler and handles small conveniences (filter parsing, JSON body fallback).

 - If you want built-in rate-limiting, pagination defaults, or an Express Router variant that exposes sub-routes with explicit handlers (GET /connections, GET /summary etc.), I can provide that as a follow-up.