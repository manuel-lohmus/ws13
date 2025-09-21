# CHANGELOG

All notable changes to this project are documented in this file.

## Unreleased

### Added
 - **Extensions** and tooling (newly added in this release)
    - `channels`: channel manager with createChannel, publish/broadcast, membership management and optional per-channel history replay (replayTo).
    - `events`: lightweight JSON event protocol atop WebSocket (ws.onEvent, ws.emitEvent), wildcard handlers and global manager.
    - `heartbeat`: heartbeat manager to run periodic pings, measure latency_ms, timeouts and automatic detach/onTimeout hooks.
    - `history` (in-memory): per-key circular buffer with append/list/clear/setLimit/pruneOlderThan API and global cap enforcement.
    - `sqlite-adapter` (history persistence): persistent history adapter using better-sqlite3; provides append, list, clear, setLimit, pruneOlderThan, size, keys and close.
    - `message-meta`: standardised message metadata (id, ts, sender, seq, tags, channel), helpers wrapOutgoing / parseIncoming and channel integration helper attachToChannel.
    - `routing`: pluggable rule-based router (match by prefix/topic/meta/predicate) supporting actions: channel, forward, transform, drop. Integrates with message-meta for meta-aware routing.
    - `admin`: admin HTTP endpoints including channel-history JSON and CSV export with dynamic meta columns; admin integration with channels/history stores.
    - Examples and tests: demo server/client examples and unit/integration tests for channels, events, heartbeat, history, sqlite-adapter, message-meta and routing.

### Changed
 - `channels`: support optional external historyStore (in-memory or sqlite-adapter) and replayTo uses historyStore when available.
 - `admin`: channel history export extended to include message metadata columns (CSV and JSON) and to use historyStore when provided.
 - `routing`: added message-meta integration so inbound frames are parsed for meta and outgoing channel forwards are meta-wrapped automatically.
 - `history`: in-memory implementation preserved; sqlite-adapter added as an optional persistent backend (adapter exported from history module when available).

### Fixed
 - Various small robustness improvements across extensions:
  - Safer JSON parsing for message frames in event/history/admin routes.
  - Defensive listener cleanup on detach/close across heartbeat, events and routing attach helpers.
  - Better handling of non-JSON payloads and binary frames in core message processing.

### Notes
 - Persistent history adapter uses better-sqlite3 (synchronous API). This dependency is optional and documented in README; install with npm install better-sqlite3 to enable the sqlite-adapter.
 - Tests and examples assume a clean environment; adjust ports or DB paths in example files if conflicts occur.

---

## [1.1.1] - 2025-09-21

### Fixed
 - Added missing socket 'close' handler. This improves client mode reconnection.

---

## [1.1.0] - 2025-09-18

### Added
 - **Core**
    - Initial stable WebSocket core implementation (`index.js`): connection handshake, frame parsing, fragmentation handling, ping/pong and close handling, extension hook points and basic permessage-deflate support.
    - permessage-deflate extension (`permessage-deflate.js`): deflate/inflate implementation and extension negotiation helpers.
    - `createRegistry()` — lightweight connection registry with broadcast and auto-clean.
    - `attachServer(server, opts)` — simple HTTP upgrade wiring.
    - `package.json` metadata and project scaffolding.

---

## [1.0.9] - 2025-05-24

### Fixed
 - Minor bug fixes in channel membership edge-cases and message broadcast error handling.

---

## [1.0.5] - 2024-12-31

### Changed
 - Core logging and debug hooks added for easier troubleshooting.

### Fixed
 - Frame parsing edge-case fixes for small payloads.

---

## [1.0.0] - 2024-12-23

### Added
 - Project initial public release: core WebSocket implementation (createWebSocket), basic extension point for permessage-deflate, and initial package metadata.

### Notes
 - Early alpha API; subsequent minor releases added extensions and features iteratively.

 ---