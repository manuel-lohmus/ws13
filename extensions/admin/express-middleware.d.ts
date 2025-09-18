import type { AdminAPI } from './index';
import type { RequestHandler } from 'express';

declare function createExpressAdminMiddleware(admin: AdminAPI, opts?: {
    ctxFromReq?: (req: any) => { req: any; token?: string; user?: any };
    maxPerPage?: number;
}): RequestHandler;

export = createExpressAdminMiddleware;
