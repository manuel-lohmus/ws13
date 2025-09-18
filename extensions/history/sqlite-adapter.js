"use strict";

/*
  SQLite history adapter using better-sqlite3 (sync API).
  Install only when you want to use it:
    npm install better-sqlite3

  API:
    const { createSqliteHistory } = require('./sqlite-adapter');
    const store = createSqliteHistory(dbPath, { defaultLimit: 100, maxTotalItems: 10000 });
    store.append(bucket, payload, { ts, limit });
    const items = store.list(bucket, { limit, since, until, reverse, filter });
    store.clear(bucket);
    store.setLimit(bucket, limit);
    store.pruneOlderThan(ms);
    store.size(bucket);
    store.keys();
    store.close();
*/

const fs = require('fs');
const path = require('path');

function createSqliteHistory(dbPath, opts = {}) {
    const defaultLimit = Number(opts.defaultLimit || 100);
    const maxTotalItems = Number(opts.maxTotalItems || 0); // 0 = unlimited
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Lazy require to avoid crash if dependency not installed until used.
    let Database;
    try {
        Database = require('better-sqlite3');
    } catch (e) {
        throw new Error("better-sqlite3 is required for sqlite-adapter. Install: npm i better-sqlite3");
    }

    const db = new Database(dbPath);
    // safer journaling for concurrent readers/writers
    try { db.pragma('journal_mode = WAL'); } catch (_) { }

    db.prepare(`
    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bucket TEXT NOT NULL,
      ts INTEGER NOT NULL,
      payload TEXT NOT NULL
    )
  `).run();

    db.prepare(`CREATE INDEX IF NOT EXISTS idx_bucket_ts ON history(bucket, ts)`).run();

    const insertStmt = db.prepare(`INSERT INTO history(bucket, ts, payload) VALUES (?, ?, ?)`);
    const deleteOldestStmt = db.prepare(`DELETE FROM history WHERE id IN (
      SELECT id FROM history WHERE bucket = ? ORDER BY ts ASC LIMIT ?
    )`);
    const listStmt = db.prepare(`SELECT id, bucket, ts, payload FROM history WHERE bucket = ? AND ts >= ? AND ts <= ? ORDER BY ts ASC LIMIT ?`);
    const listAllStmt = db.prepare(`SELECT id, bucket, ts, payload FROM history WHERE bucket = ? ORDER BY ts ASC LIMIT ?`);
    const countBucketStmt = db.prepare(`SELECT COUNT(*) as c FROM history WHERE bucket = ?`);
    const keysStmt = db.prepare(`SELECT DISTINCT bucket FROM history`);
    const deleteBucketStmt = db.prepare(`DELETE FROM history WHERE bucket = ?`);
    const deleteOlderThanStmt = db.prepare(`DELETE FROM history WHERE ts < ?`);
    const globalCountStmt = db.prepare(`SELECT COUNT(*) as c FROM history`);
    const deleteGlobalOldestStmt = db.prepare(`DELETE FROM history WHERE id IN (
      SELECT id FROM history ORDER BY ts ASC LIMIT ?
    )`);

    function append(bucket, payload, options = {}) {
        if (!bucket) throw new TypeError("append: bucket required");
        const ts = typeof options.ts === 'number' ? options.ts : Date.now();
        const json = typeof payload === 'string' ? payload : JSON.stringify(payload);
        insertStmt.run(bucket, ts, json);

        const limit = options.limit || defaultLimit;
        if (limit && limit > 0) {
            const cnt = countBucketStmt.get(bucket).c;
            if (cnt > limit) {
                const toRemove = cnt - limit;
                deleteOldestStmt.run(bucket, toRemove);
            }
        }

        if (maxTotalItems && maxTotalItems > 0) {
            const total = globalCountStmt.get().c;
            if (total > maxTotalItems) {
                const toRemove = total - maxTotalItems;
                deleteGlobalOldestStmt.run(toRemove);
            }
        }

        return true;
    }

    function list(bucket, options = {}) {
        if (!bucket) return [];
        const limit = Number(options.limit || -1);
        const since = typeof options.since === 'number' ? options.since : -8640000000000000;
        const until = typeof options.until === 'number' ? options.until : 8640000000000000;

        let rows;
        if (limit > 0) rows = listStmt.all(bucket, since, until, limit);
        else rows = listAllStmt.all(bucket, since, until, Number.MAX_SAFE_INTEGER);

        let items = rows.map(r => {
            let payload;
            try { payload = JSON.parse(r.payload); } catch (e) { payload = r.payload; }
            return { ts: r.ts, payload };
        });

        if (options.filter && typeof options.filter === 'function') {
            items = items.filter(i => { try { return Boolean(options.filter(i.payload, i)); } catch (e) { return false; } });
        }

        if (options.reverse) items = items.reverse();
        if (typeof options.limit === 'number' && options.limit > 0) items = items.slice(0, options.limit);
        return items;
    }

    function clear(bucket) {
        if (!bucket) return false;
        deleteBucketStmt.run(bucket);
        return true;
    }

    function setLimit(bucket, limit) {
        if (!bucket) throw new TypeError("setLimit: bucket required");
        const l = Math.max(1, Number(limit) || defaultLimit);
        const cnt = countBucketStmt.get(bucket).c;
        if (cnt > l) {
            const toRemove = cnt - l;
            deleteOldestStmt.run(bucket, toRemove);
        }
        return true;
    }

    function pruneOlderThan(ms) {
        if (!ms || ms <= 0) return;
        const cutoff = Date.now() - ms;
        deleteOlderThanStmt.run(cutoff);
    }

    function size(bucket) {
        if (bucket) return countBucketStmt.get(bucket).c;
        return globalCountStmt.get().c;
    }

    function keys() {
        return keysStmt.all().map(r => r.bucket);
    }

    function close() { try { db.close(); } catch (_) { } }

    return {
        append,
        list,
        clear,
        setLimit,
        pruneOlderThan,
        size,
        keys,
        close
    };
}

module.exports = { createSqliteHistory };
