// Type definitions for ws13 1.0
// Based on Copilot's work (index.d.ts)

import { IncomingMessage, ClientRequest } from 'http';
import { Socket } from 'net';
import { Buffer } from 'buffer';
import { EventEmitter } from 'events';

/**
 * WebSocket client for ws13 protocol.
 * @param options - Options for WebSocket client.
 * @param options.isDebug - Enable debug mode.
 * @param options.request - HTTP request object.
 * @param options.headers - HTTP headers.
 * @param options.socket - TCP socket.
 * @param options.protocol - WebSocket sub-protocol.
 * @param options.origin - WebSocket origin.
 * @param options.heartbeatInterval_ms - Heartbeat interval in milliseconds.
 * @param options.extension - WebSocket extension. (e.g. PermessageDeflate())
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
 * @method init - Initialize extension. (e.g. init: (ws: WebSocket) => void)
 * @method close - Close extension. (e.g. close: (callback: (error: Error) => void) => void)
 * @method mask - Mask frame. (e.g. mask: (frame: Frame, callback: (error: Error, frame: Frame) => void) => void)
 * @method unmask - Unmask frame. (e.g. unmask: (frame: Frame, callback: (error: Error, frame: Frame) => void) => void)
 * @method generateOffer - Generate offer headers. (e.g. generateOffer: (callback: (error: Error, headers: string[]) => void) => void)
 * @method activate - Activate extension. (e.g. activate: (headers: string[], callback: (error: Error, isActivate: boolean) => void) => void)
 * @method generateResponse - Generate response headers. (e.g. generateResponse: (headers: string[], callback: (error: Error, extHeader: string) => void) => void)
 * @method processIncomingMessage - Process incoming message. (e.g. processIncomingMessage: (frame: Frame, callback: (error: Error, frame: Frame) => void) => void)
 * @method processOutgoingMessage - Process outgoing message. (e.g. processOutgoingMessage: (frame: Frame, callback: (error: Error, frame: Frame) => void) => void)
 * @method processIncomingFrame - Process incoming frame. (e.g. processIncomingFrame: (frame: Frame, callback: (error: Error, frame: Frame) => void) => void)
 * @method processOutgoingFrame - Process outgoing frame. (e.g. processOutgoingFrame: (frame: Frame, callback: (error: Error, frame: Frame) => void) => void)
 * @returns WebSocket extension.
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
 * @property isFin - FIN bit.
 * @property isRsv1 - RSV1 bit.
 * @property isRsv2 - RSV2 bit.
 * @property isRsv3 - RSV3 bit.
 * @property opcode - Opcode. (0x0: Continuation, 0x1: Text, 0x2: Binary, 0x8: Close, 0x9: Ping, 0xA: Pong)
 * @property isMasked - Mask bit. (true: Masked, false: Unmasked)
 * @property payloadLength - Payload length.
 * @property maskingKey - Masking key. (4 bytes)
 * @property payload - Payload data. (Buffer)
 * @see https://tools.ietf.org/html/rfc6455#section-5.2
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
 * @constructor WebSocket - Create WebSocket event emitter. (e.g. new WebSocket(options))
 * @event open - WebSocket connection is established. (e.g. open: () => void)
 * @event message - WebSocket message is received. (e.g. message: (event: { data: any, isBinary: boolean }) => void)
 * @event ping - WebSocket ping message is received. (e.g. ping: (event: { data: any }) => void) }
 * @event pong - WebSocket pong message is received. (e.g. pong: (event: { data: any, latency_ms: number }) => void) }
 * @event close - WebSocket connection is closed. (e.g. close: (event: { code: number, reason: string }) => void)}
 * @event error - WebSocket error occurred.
 * @method close - Close WebSocket connection. (e.g. close: (code?: number, reason?: string) => void)
 * @method heartbeat - Send WebSocket ping message. (e.g. heartbeat: (callback: (latency_ms: number) => void) => void)
 * @method send - Send WebSocket message. (e.g. send: (data: any) => void)
 * @method sendPing - Send WebSocket ping message. (e.g. sendPing: (data?: any) => void)
 * @method sendPong - Send WebSocket pong message. (e.g. sendPong: (data?: any) => void)
 * @property protocol - WebSocket sub-protocol.
 * @property readyState - WebSocket connection state. (0: CONNECTING, 1: OPEN, 2: CLOSING, 3: CLOSED)
 * @property path - WebSocket path.
 * @property url - WebSocket URL.
 * @property origin - WebSocket origin.
 * @property heartbeatInterval_ms - Heartbeat interval in milliseconds.
 * @property ip - WebSocket server IP address.
 * @property port - WebSocket server port number.
 * @property latency_ms - WebSocket latency in milliseconds.
 * @returns WebSocket event emitter.
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
