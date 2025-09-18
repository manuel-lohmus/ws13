/// <reference types="node" />

import { EventEmitter } from 'events';
import { IncomingMessage, ClientRequest, Server as HttpServer } from 'http';
import { Socket } from 'net';

/** WebSocket-like instance returned by createWebSocket */
export interface WebSocketLike extends EventEmitter {
    readonly CONNECTING: 0;
    readonly OPEN: 1;
    readonly CLOSING: 2;
    readonly CLOSED: 3;

    onopen: ((event?: any) => void) | null;
    onmessage: ((event: { data: any; isBinary?: boolean }) => void) | null;
    onping: ((event?: any) => void) | null;
    onpong: ((event?: any) => void) | null;
    onclose: ((event: { code: number; reason: string; wasClean: boolean }) => void) | null;
    onerror: ((event: any) => void) | null;

    close(code?: number, reason?: string): Promise<{ code: number; reason: string; wasClean: boolean }>;
    heartbeat(callback?: (latency_ms: number) => void): void;
    send(data: any): Promise<{ length: number; opcode: number }>;
    sendPing(data?: any): void;
    sendPong(data?: any): void;

    readonly path: string;
    origin: string;
    heartbeatInterval_ms: number;
    readonly ip: string;
    readonly port: number;
    readonly latency_ms: number;
    binaryType: 'arraybuffer' | 'nodebuffer' | 'blob';
    readonly bufferedAmount: number;
    readonly extensions: string;
    readonly protocol: string;
    readonly readyState: 0 | 1 | 2 | 3;
    readonly url: string;
}

export interface Extension {
    init?(ws: WebSocketLike): void;
    activate?(headers: Record<string, string>, cb: (err: Error | null, isActivate: boolean) => void): void;
    generateOffer?(cb: (err: Error | null, extensionHeaderValue: string) => void): void;
    generateResponse?(
        headers: Record<string, string>,
        cb: (err: Error | null, extensionHeaderValue: string) => void
    ): void;
    mask?(frame: any, cb: (err: Error | null, frame: any) => void): void;
    unmask?(frame: any, cb: (err: Error | null, frame: any) => void): void;
    processOutgoingFrame?(frame: any, cb: (err: Error | null, frame: any) => void): void;
    processIncomingFrame?(frame: any, cb: (err: Error | null, frame: any) => void): void;
    processOutgoingMessage?(message: any, cb: (err: Error | null, message: any) => void): void;
    processIncomingMessage?(message: any, cb: (err: Error | null, message: any) => void): void;
    close?(cb: (err?: Error) => void): void;
}

export interface CreateWebSocketOptions {
    isDebug?: boolean;
    request?: IncomingMessage | ClientRequest;
    headers?: Record<string, string>;
    socket?: Socket;
    protocol?: string | string[];
    origin?: string;
    heartbeatInterval_ms?: number;
    extension?: Extension | null;
    autoReconnect?: boolean;
    reconnectAttempts?: number;
    reconnectDelay?: number;
    reconnectBackoff?: number;
    reconnectMaxDelay?: number;
    requestFactory?: () => ClientRequest;
    shouldReconnect?: (evt: { code: number; reason: string; wasClean: boolean }) => boolean;
}

export type CreateWebSocketFn = (options: CreateWebSocketOptions) => WebSocketLike | null;

export interface Registry {
    add(ws: WebSocketLike): WebSocketLike;
    delete(ws: WebSocketLike): void;
    broadcast(data: any): void;
    size(): number;
    clients: Set<WebSocketLike>;
}

export interface AttachServerOptions {
    registry?: Registry;
    onConnect?: (ws: WebSocketLike, req: IncomingMessage) => void;
}

export interface AttachServerResult {
    registry: Registry;
}

export interface CreateRegistry {
    (): Registry;
}

export interface AttachServer {
    (server: HttpServer, options?: AttachServerOptions): AttachServerResult;
}

/** Main export type */
export interface CreateWebSocketExport extends CreateWebSocketFn {
    CONNECTING: 0;
    OPEN: 1;
    CLOSING: 2;
    CLOSED: 3;
    createWebSocket: CreateWebSocketFn; // alias
    createRegistry: CreateRegistry;
    attachServer: AttachServer;
}

declare const createWebSocket: CreateWebSocketExport;
export = createWebSocket;
