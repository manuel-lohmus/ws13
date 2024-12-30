// Type definitions for ws13 1.0
// Based on Copilot's work (index.d.ts)

import { IncomingMessage, ClientRequest } from 'http';
import { Socket } from 'net';
import { Buffer } from 'buffer';
import { EventEmitter } from 'events';

/**
 * Options for create WebSocket.
 */
export interface Options {
    isDebug?: boolean;
    request: IncomingMessage | ClientRequest;
    headers?: { [key: string]: string };
    socket?: Socket;
    protocol?: string;
    origin?: string;
    heartbeatInterval_ms?: number;
    extension?: Extension | null;
}

/**
 * WebSocket extension interface.
 */
export interface Extension {
    init(ws: WebSocket): void;
    close(callback: (error: Error) => void): void;
    mask(frame: Frame, callback: (error: Error, frame: Frame) => void): void;
    unmask(frame: Frame, callback: (error: Error, frame: Frame) => void): void;
    generateOffer(callback: (error: Error, headers: string[]) => void): void;
    activate(headers: string[], callback: (error: Error, isActivate: boolean) => void): void;
    generateResponse(headers: string[], callback: (error: Error, extHeader: string) => void): void;
    processIncomingMessage(frame: Frame, callback: (error: Error, frame: Frame) => void): void;
    processOutgoingMessage(frame: Frame, callback: (error: Error, frame: Frame) => void): void;
    processIncomingFrame(frame: Frame, callback: (error: Error, frame: Frame) => void): void;
    processOutgoingFrame(frame: Frame, callback: (error: Error, frame: Frame) => void): void;
}

/**
 * WebSocket frame interface.
 */
export interface Frame {
    isFin: boolean;
    isRsv1: boolean;
    isRsv2: boolean;
    isRsv3: boolean;
    opcode: boolean;
    isMasked: boolean;
    payloadLength: number;
    maskingKey: number[] | null;
    payload: Buffer | null;
}

/**
 * WebSocket event emitter.
 */
export declare class WebSocket extends EventEmitter {
    static CONNECTING: 0;
    static OPEN: 1;
    static CLOSING: 2;
    static CLOSED: 3;

    constructor(options: Options);

    CONNECTING: 0;
    OPEN: 1;
    CLOSING: 2;
    CLOSED: 3;

    onopen: (() => void) | null;
    onmessage: ((event: { data: any, isBinary: boolean }) => void) | null;
    onping: ((event: { data: any }) => void) | null;
    onpong: ((event: { data: any, latency_ms: number }) => void) | null;
    onclose: ((event: { code: number, reason: string }) => void) | null;
    onerror: ((event: any) => void) | null;

    protocol: string;
    readyState: 0 | 1 | 2 | 3;
    path: string;
    url: string;
    origin: string;
    heartbeatInterval_ms: number;
    ip: string;
    port: number;
    latency_ms: number;

    close(code?: number, reason?: string): void;
    heartbeat(callback?: (latency_ms: number) => void): void;
    send(data: any): void;
    sendPing(data?: any): void;
    sendPong(data?: any): void;
}

export default WebSocket;
