export interface HistoryItem<T = any> {
    ts: number;
    payload: T;
}

export interface HistoryBucket<T = any> {
    limit: number;
    items: HistoryItem<T>[];
}

export interface HistoryStore {
    append(key: string, payload: any, opts?: { ts?: number, limit?: number }): boolean;
    list(key: string, opts?: { limit?: number, since?: number, until?: number, reverse?: boolean, filter?: (payload: any, item: HistoryItem) => boolean }): HistoryItem[];
    clear(key: string): boolean;
    setLimit(key: string, limit: number): boolean;
    pruneOlderThan(ms: number): void;
    size(key?: string): number;
    keys(): string[];
    _store: Map<string, HistoryBucket>;
}

export function createHistoryStore(options?: { defaultLimit?: number, maxTotalItems?: number }): HistoryStore;
