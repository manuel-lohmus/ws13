"use strict";

const { test } = require('../../../testRunner');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { createSqliteHistory } = require('./sqlite-adapter');

test("sqlite-adapter: append/list/clear/prune/size", (check, done) => {
    const dbPath = path.join(os.tmpdir(), `ws13-history-${Date.now()}.db`);
    const store = createSqliteHistory(dbPath, { defaultLimit: 5, maxTotalItems: 100 });
    store.append('chan1', { t: 1 });
    store.append('chan1', { t: 2 });
    store.append('chan1', { t: 3 });
    const items = store.list('chan1', { limit: 10 });
    check('items length', items.length).mustBe(3);

    store.setLimit('chan1', 1);
    check('size after trim', store.size('chan1')).mustBe(1);

    store.clear('chan1');
    check('size after clear', store.size('chan1')).mustBe(0);

    store.append('k1', { x: 1 });
    store.append('k2', { x: 2 });
    // prune older than 0ms => removes all older than now -> likely none immediate but sanity call
    store.pruneOlderThan(0);
    check('keys array', Array.isArray(store.keys())).mustBe(true);

    store.close();
    try { fs.unlinkSync(dbPath); } catch (_) { }
    done();
});
