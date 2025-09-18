"use strict";

const { test } = require('../../../testRunner');
const { createChannelsManager } = require('./index');

test("channels: create channel, join/leave, broadcast and history replay", (check, done) => {
    const mgr = createChannelsManager({ historyLimit: 3 });

    const chat = mgr.createChannel('chat');
    check('list includes chat', mgr.list().includes('chat')).mustBe(true);
    check('initial size', chat.size()).mustBe(0);

    // mock ws-like
    function mk(name) {
        const ev = {};
        return {
            id: name,
            send: (d) => { ev.last = d; ev.queue = ev.queue || []; ev.queue.push(d); },
            on: (evName, fn) => { ev[evName] = fn; },
            triggerClose: () => ev.close && ev.close({ code: 1000 }),
            __ev: ev
        };
    }

    const a = mk('a'), b = mk('b'), c = mk('c');

    check('add a', chat.add(a)).mustBe(true);
    check('add b', chat.add(b)).mustBe(true);
    check('size after join', chat.size()).mustBe(2);

    // publish from a
    const wrapped = chat.broadcast({ text: 'hello' }, { sender: a });
    check('wrapped channel', wrapped.channel).mustBe('chat');

    // ensure both have message
    setTimeout(() => {
        check('a got message', a.__ev.queue.length >= 1).mustBe(true);
        check('b got message', b.__ev.queue.length >= 1).mustBe(true);

        // test history store and replay
        chat.broadcast({ text: 'm2' }, {});
        chat.broadcast({ text: 'm3' }, {});
        chat.broadcast({ text: 'm4' }, {});
        check('history length capped', chat.history.length).mustBe(3);

        // replay to c
        const count = chat.replayTo(c);
        check('replay count', count).mustBe(3);
        check('c queue after replay', c.__ev.queue.length).mustBe(3);

        // remove and ensure size decrements
        chat.remove(a);
        check('size after remove', chat.size()).mustBe(1);

        done();
    }, 20);
});

test("channels: permissionChecker respects canJoin and canPublish", (check, done) => {
    const perm = {
        canJoin: (ws, name) => ws && ws.allowedJoin === true,
        canPublish: (ws, name, payload) => ws && ws.allowedPublish === true
    };
    const mgr = createChannelsManager({ historyLimit: 0, permissionChecker: perm });
    const ch = mgr.createChannel('secure');

    const allowed = { allowedJoin: true, allowedPublish: true, send: () => { } };
    const denied = { allowedJoin: false, allowedPublish: false, send: () => { } };

    check('allowed join', ch.add(allowed)).mustBe(true);
    check('denied join', ch.add(denied)).mustBe(false);

    // publish allowed
    ch.publish(allowed, { ok: 1 }).then(res => {
        check('publish result not false', res !== false).mustBe(true);

        // publish denied
        ch.publish(denied, { ok: 1 }).then(res2 => {
            check('publish denied is false', res2 === false).mustBe(true);
            done();
        });
    }).catch(done);
});
