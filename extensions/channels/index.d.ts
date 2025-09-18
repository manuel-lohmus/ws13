import type { WebSocketLike } from "../../core";

export interface ChannelMessage {
    channel: string;
    payload: any;
    meta: any;
    timestamp: number;
}

export interface Channel {
    name: string;
    add(ws: WebSocketLike): boolean;
    remove(ws: WebSocketLike): void;
    size(): number;
    broadcast(payload: any, opts?: { sender?: WebSocketLike; excludeSender?: boolean; meta?: any }): ChannelMessage;
    publish(ws: WebSocketLike, payload: any): Promise<false | ChannelMessage>;
    replayTo(ws: WebSocketLike): number;
    members: Set<WebSocketLike>;
    history: ChannelMessage[] | null;
}

export interface ConnectionsPage {
    total: number;
    page: number;
    perPage: number;
    pages: number;
    results: Channel[];
}

export interface ChannelsManagerOptions {
    historyLimit?: number;
    permissionChecker?: {
        canJoin?: (ws: WebSocketLike, channelName: string) => boolean | Promise<boolean>;
        canPublish?: (ws: WebSocketLike, channelName: string, payload: any) => boolean | Promise<boolean>;
    };
}

export function createChannelsManager(opts?: ChannelsManagerOptions): {
    createChannel(name: string): Channel;
    getChannel(name: string): Channel | undefined;
    list(): string[];
    closeAll(): void;
};
