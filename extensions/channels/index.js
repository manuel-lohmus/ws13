"use strict";

/**
 * channels extension for ws13
 *
 * API:
 *  const mgr = createChannelsManager({ historyLimit, permissionChecker })
 *  const chat = mgr.createChannel('chat')
 *  chat.add(ws)            // join
 *  chat.remove(ws)         // leave
 *  chat.broadcast(data, opts)  // send to all members (opts.sender, opts.meta)
 *  chat.publish(ws, data)  // check canPublish then broadcast
 *  chat.replayTo(ws)       // send stored history to ws
 *
 *  mgr.getChannel(name)
 *  mgr.list() -> array of names
 *
 * permissionChecker: optional { canJoin(ws, channelName), canPublish(ws, channelName, payload) }
 */

function createChannelsManager(options = {}) {
    const historyLimit = Number(options.historyLimit || 0) || 0;
    const permissionChecker = options.permissionChecker || null;
    const historyStore = options.historyStore || null; // NEW

    const channels = new Map();

    function createChannel(name) {
        if (!name) throw new TypeError("channel name required");
        if (channels.has(name)) return channels.get(name);

        const members = new Set();
        const history = historyLimit > 0 ? [] : null;

        function add(ws) {
            if (!ws) throw new TypeError("ws required");
            // permission check
            if (permissionChecker && typeof permissionChecker.canJoin === "function") {
                try {
                    const allowed = permissionChecker.canJoin(ws, name);
                    if (!allowed) return false;
                } catch (e) { return false; }
            }
            members.add(ws);
            // auto clean on close
            const onClose = () => members.delete(ws);
            ws.__channels = ws.__channels || new Set();
            ws.__channels.add(name);
            ws.on && ws.on("close", onClose);
            return true;
        }

        function remove(ws) {
            members.delete(ws);
            if (ws && ws.__channels) {
                ws.__channels.delete(name);
                if (ws.__channels.size === 0) delete ws.__channels;
            }
        }

        function size() { return members.size; }

        function broadcast(payload, opts = {}) {
            const sender = opts.sender;
            const meta = opts.meta || null;
            const wrapped = { channel: name, payload, meta, timestamp: Date.now() };

            // store in history: prefer external historyStore
            try {
                if (historyStore && typeof historyStore.append === "function") {
                    historyStore.append(name, wrapped, { limit: historyLimit });
                } else if (history) {
                    history.push(wrapped);
                    if (history.length > historyLimit) history.shift();
                }
            } catch (e) { /* ignore history errors */ }

            for (const m of Array.from(members)) {
                try {
                    // skip sender if asked
                    if (opts.excludeSender && m === sender) continue;
                    if (m && typeof m.send === "function") m.send(JSON.stringify(wrapped));
                } catch (e) {
                    // best-effort: remove closed members
                    try { members.delete(m); } catch (_) { }
                }
            }

            return wrapped;
        }

        async function publish(ws, payload) {
            if (permissionChecker && typeof permissionChecker.canPublish === "function") {
                try {
                    const allowed = await permissionChecker.canPublish(ws, name, payload);
                    if (!allowed) return false;
                } catch (e) { return false; }
            }
            return broadcast(payload, { sender: ws });
        }

        function replayTo(ws) {
            // prefer historyStore replay
            if (historyStore && typeof historyStore.list === "function") {
                try {
                    const items = historyStore.list(name, { limit: historyLimit, reverse: false });
                    for (const it of items) {
                        try { ws.send(JSON.stringify(it.payload !== undefined ? it.payload : it)); } catch (_) { }
                    }
                    return items.length;
                } catch (e) { return 0; }
            }

            // fallback to local history array
            if (!history || !ws || typeof ws.send !== "function") return 0;
            for (const item of history) {
                try { ws.send(JSON.stringify(item)); } catch (_) { }
            }
            return history.length;
        }

        const channel = { name, add, remove, size, broadcast, publish, replayTo, members, history };
        channels.set(name, channel);
        return channel;
    }

    function getChannel(name) { return channels.get(name); }
    function list() { return Array.from(channels.keys()); }
    function closeAll() {
        for (const ch of channels.values()) {
            for (const m of Array.from(ch.members)) {
                try { ch.remove(m); } catch (_) { }
            }
        }
        channels.clear();
    }

    return { createChannel, getChannel, list, closeAll };
}

module.exports = { createChannelsManager };
