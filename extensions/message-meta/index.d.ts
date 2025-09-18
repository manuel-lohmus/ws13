export interface MessageMeta {
    id: string;
    ts: number;
    sender?: string | null;
    seq?: number;
    tags?: string[] | null;
    channel?: string | null;
    [key: string]: any;
}

export interface MessageMetaAPI {
    attach(ws: any, opts?: any): any;
    wrapOutgoing(ws: any, payload: any, opts?: { meta?: any; tags?: any; channel?: string; sender?: string }): Promise<{ meta: MessageMeta; frame: string }>;
    parseIncoming(raw: any): { ok: boolean; reason?: string; meta?: MessageMeta | null; payload?: any; error?: any };
    attachToChannel(channel: any): any;
}

export function createMessageMeta(options?: {
    idGenerator?: () => string;
    clock?: () => number;
    perConnectionSequence?: boolean;
    signOutgoing?: (meta: any, payload: any) => Promise<any> | any;
    validateIncoming?: (meta: any) => boolean;
    metaField?: string;
}): MessageMetaAPI;
