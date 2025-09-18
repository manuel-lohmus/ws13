import type { WebSocketLike } from "../../core";

export interface VerifyResult {
    ok: boolean;
    user?: any | null;
    roles?: string[];
    meta?: any | null;
    error?: any;
}

export type VerifierFn = (token: string) => Promise<VerifyResult> | VerifyResult;

export interface CreateAuthOptions {
    verifier?: VerifierFn;
    roleAccessor?: (res: VerifyResult) => string[];
    tokenSources?: ('query' | 'header')[];
    headerName?: string;
}

export interface AuthAPI {
    verifyToken(token: string): Promise<VerifyResult>;
    requireRole(role: string, wsOrCtx?: any): Promise<boolean> | boolean;
    wsAuthenticate(ws: WebSocketLike, req: any, opts?: { token?: string }): Promise<boolean>;
    httpMiddleware(opts?: any): any;
    defaultVerifier(map?: Record<string, any>): VerifierFn;
}

export function createAuth(options?: CreateAuthOptions): AuthAPI;
export function defaultVerifier(map?: Record<string, any>): VerifierFn;
export function attachAuthToServer(server: any, auth: AuthAPI, opts: { createWebSocket: Function, registry?: any, onConnect?: Function, onAuthFailed?: Function }): any;
export function jwtVerifier(secretOrPublicKey: string | Buffer, opts?: { algorithms?: string[], ignoreExpiration?: boolean }): VerifierFn;
