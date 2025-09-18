export type RoutingMatch = {
    prefix?: string;
    topic?: string;
    meta?: Record<string, any>;
    predicate?: (payload: any, meta: any, ctx?: any) => boolean | Promise<boolean>;
};

export type RoutingAction =
    | { type: "channel"; channel: string }
    | { type: "forward"; to: (payload: any, meta: any, ctx?: any) => any }
    | { type: "drop" }
    | { type: "transform"; fn: (payload: any, meta: any, ctx?: any) => any | Promise<any> };

export type RoutingRule = {
    name?: string;
    match?: RoutingMatch;
    action?: RoutingAction;
};

export interface Router {
    addRule(rule: RoutingRule): () => void;
    listRules(): RoutingRule[];
    handle(raw: any, ctx?: any): Promise<{ action: string; info?: any; error?: any }>;
    attachToSocket(ws: any, opts?: any): () => void;
    matchRule(rule: RoutingRule, payload: any, meta: any, ctx?: any): boolean | { async: true };
}

export function createRouter(options?: { rules?: RoutingRule[]; onRoute?: (info: any, ctx?: any) => void; metaField?: string }): Router;
