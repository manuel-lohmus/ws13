import type { WebSocketLike, Registry } from "../../core";

export interface ConnectionInfo {
    ip: string;
    port: number | string | null;
    url: string;
    readyState: number | null;
    latency_ms: number | null;
    bufferedAmount: number | null;
    heartbeatInterval_ms: number | null;
    authUser: string | null;
    authRoles: string[];
    idle: boolean;
    lastSeen: string | number | null;
    connectedSince: string | number | null;
}

export interface ConnectionsPage {
    total: number;
    page: number;
    perPage: number;
    pages: number;
    results: ConnectionInfo[];
}

export interface AdminAPI {
    getConnections(opts?: { page?: number; perPage?: number; filter?: any }): ConnectionsPage;
    getSummary(): { total: number; open: number; avgLatency_ms: number | null };
    exportJSON(opts?: { filter?: any }): string;
    exportCSV(opts?: { filter?: any }): string;
    disconnectByIp(ip: string): number;
    registerListener(ws: WebSocketLike, opts?: { req?: any; token?: string; user?: any; requireRole?: string }): Promise<() => void>;
    broadcastUpdate(payload: any): void;
    httpHandler(req: any, res: any, opts?: { token?: string; user?: any; requireRole?: string }): void;
}

export function createAdmin(registry: Registry, options?: {
    authorize?: (ctx: { req?: any; ws?: WebSocketLike; token?: string; user?: any }) => boolean | Promise<boolean>;
    requireRole?: string | null;
    rolesAccessor?: (ws: WebSocketLike) => string[];
}): AdminAPI;
