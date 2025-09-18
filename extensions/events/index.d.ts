import type { WebSocketLike } from "../../core";

export type EventHandler = (data: any, meta: any, raw?: any) => void;

export interface EventAPI {
    attach(ws: WebSocketLike): WebSocketLike;
    on(name: string, fn: EventHandler): () => void;
    off(name: string, fn: EventHandler): void;
}

export function createEventAPI(): EventAPI;
