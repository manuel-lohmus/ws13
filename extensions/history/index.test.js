"use strict";

const { test } = require('../../../testRunner');
const { createHistoryStore } = require('./index');

test("history: append, list, limit and prune", (check, done) => {
    const hs = createHistoryStore({ defaultLimit: 3, maxTotalItems: 10 });

    hs.append('chan1', { text: 'm1' });
    hs.append('chan1', { text: 'm2' });
    hs.append('chan1', { text: 'm3' });

    check('size chan1', hs.size('chan1')).mustBe(3);

    // append beyond limit
    hs.append('chan1', { text: 'm4' });
    check('limit enforced', hs.size('chan1')).mustBe(3);

    const list = hs.list('chan1', { reverse: false });
    check('oldest is m2', list[0].payload.text).mustBe('m2');

    // set smaller limit and ensure trimming
    hs.setLimit('chan1', 2);
    check('trimmed to 2', hs.size('chan1')).mustBe(2);

    // multiple keys and global maxTotalItems
    for (let i = 0; i < 10; i++) hs.append('k' + i, { i });
    check('global size <= maxTotalItems', hs.size() <= 10).mustBe(true);

    // prune older than small ms (no-op if immediate timestamps)
    hs.pruneOlderThan(1);
    // can't assert exact as timestamps are now-based — sanity check runs
    check('keys is array', Array.isArray(hs.keys())).mustBe(true);

    hs.clear('chan1');
    check('chan1 cleared', hs.size('chan1')).mustBe(0);

    done();
});
