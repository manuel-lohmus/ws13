import type { WebSocketLike } from "../../core";

export interface HeartbeatOptions {
    interval_ms?: number;
    timeout_ms?: number;
    onTimeout?: (ws: WebSocketLike) => void;
    payload?: any;
}

export interface HeartbeatManager {
    attach(ws: WebSocketLike, opts?: HeartbeatOptions): WebSocketLike;
    detach(ws: WebSocketLike): boolean;
    ping(ws: WebSocketLike, opts?: HeartbeatOptions): Promise<number | false>;
    stopAll(): boolean;
    _has(ws: WebSocketLike): boolean;
}

export function createHeartbeatManager(options?: { interval_ms?: number; timeout_ms?: number }): HeartbeatManager;
