"use strict";

/**
 * history extension for ws13
 *
 * Provides a small history store with:
 *  - per-key circular buffer (key can be connection id, channel name, etc.)
 *  - append(key, item)
 *  - list(key, { limit, since, until, reverse, filter })
 *  - clear(key)
 *  - pruneOlderThan(ms)
 *
 * Designed to be embeddable in channels/admin extensions.
 */

function createHistoryStore(options = {}) {
    const defaultLimit = Number(options.defaultLimit || 100);
    const maxTotalItems = Number(options.maxTotalItems || 10000); // global safety cap
    const store = new Map(); // key -> { limit, items: Array<{ts, payload}> }

    function makeBucket(key, limit) {
        const l = Number(limit || defaultLimit) || defaultLimit;
        const b = { limit: Math.max(1, l), items: [] };
        store.set(key, b);
        return b;
    }

    function getBucket(key) {
        if (!store.has(key)) return null;
        return store.get(key);
    }

    function append(key, payload, opts = {}) {
        if (!key) throw new TypeError("append: key required");
        const ts = typeof opts.ts === "number" ? opts.ts : Date.now();
        let bucket = getBucket(key) || makeBucket(key, opts.limit);
        bucket.items.push({ ts, payload });
        // cap individual bucket
        while (bucket.items.length > bucket.limit) bucket.items.shift();
        // global cap: naive pruning from oldest buckets
        enforceGlobalCap();
        return true;
    }

    function list(key, opts = {}) {
        const bucket = getBucket(key);
        if (!bucket) return [];
        const { limit = bucket.limit, since, until, reverse = false, filter } = opts;
        let items = bucket.items.slice();

        if (typeof since === "number") items = items.filter(i => i.ts >= since);
        if (typeof until === "number") items = items.filter(i => i.ts <= until);
        if (typeof filter === "function") items = items.filter(i => {
            try { return Boolean(filter(i.payload, i)); } catch (e) { return false; }
        });

        if (reverse) items = items.reverse();
        if (typeof limit === "number") items = items.slice(0, limit);
        return items.map(i => ({ ts: i.ts, payload: i.payload }));
    }

    function clear(key) {
        if (!key) return false;
        if (!store.has(key)) return false;
        store.delete(key);
        return true;
    }

    function setLimit(key, limit) {
        if (!key) throw new TypeError("setLimit: key required");
        const l = Math.max(1, Number(limit) || defaultLimit);
        const bucket = getBucket(key) || makeBucket(key, l);
        bucket.limit = l;
        // trim if needed
        while (bucket.items.length > bucket.limit) bucket.items.shift();
        return true;
    }

    function pruneOlderThan(ms) {
        const cutoff = Date.now() - ms;
        for (const [k, b] of store.entries()) {
            b.items = b.items.filter(i => i.ts >= cutoff);
            if (b.items.length === 0) store.delete(k);
        }
    }

    function size(key) {
        if (key) {
            const b = getBucket(key);
            return b ? b.items.length : 0;
        }
        // total
        let sum = 0;
        for (const b of store.values()) sum += b.items.length;
        return sum;
    }

    function keys() {
        return Array.from(store.keys());
    }

    function enforceGlobalCap() {
        if (maxTotalItems <= 0) return;
        let total = size();
        if (total <= maxTotalItems) return;
        // naive oldest-first eviction across buckets
        // build array of {key, ts}
        const head = [];
        for (const [k, b] of store.entries()) {
            if (b.items.length > 0) {
                head.push({ key: k, ts: b.items[0].ts });
            }
        }
        head.sort((a, b) => a.ts - b.ts);
        while (total > maxTotalItems && head.length) {
            const oldest = head.shift();
            const bucket = getBucket(oldest.key);
            if (!bucket) continue;
            // drop one from this bucket (oldest)
            if (bucket.items.length) {
                bucket.items.shift();
                total--;
                if (bucket.items.length === 0) store.delete(oldest.key);
                else {
                    // reinsert with new head ts
                    head.push({ key: oldest.key, ts: bucket.items[0].ts });
                    head.sort((a, b) => a.ts - b.ts);
                }
            }
        }
    }

    return {
        append,
        list,
        clear,
        setLimit,
        pruneOlderThan,
        size,
        keys,
        _store: store // exposed for testing/inspection
    };
}

module.exports = { createHistoryStore };

// lisa optional adapteri eksport (lazy require)
try {
    module.exports.createSqliteHistory = require('./sqlite-adapter').createSqliteHistory;
} catch (e) {
    // better-sqlite3 may be not installed; adapter export omitted
}