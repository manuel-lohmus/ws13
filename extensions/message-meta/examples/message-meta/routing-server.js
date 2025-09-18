const { createMessageMeta } = require('ws13/extensions/message-meta');
const { createRouter } = require('ws13/extensions/routing');
const mm = createMessageMeta({ perConnectionSequence: true });

const router = createRouter({
    rules: [
        { name: 'room-route', match: { prefix: 'room:' }, action: { type: 'channel', channel: 'rooms' } }
    ],
    messageMeta: mm
});

// inside attachServer onConnect:
router.attachToSocket(ws, { channelsManager: mgr });
