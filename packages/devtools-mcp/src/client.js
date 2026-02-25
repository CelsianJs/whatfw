/**
 * Browser-side WebSocket client for what-devtools-mcp.
 * Connects to the Node.js bridge server, streams devtools state and events,
 * and handles commands from the MCP server (set-signal, get-snapshot, etc.).
 */

// Branded console logger
const BADGE = 'background:#6366f1;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold';
const BADGE_CMD = 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold';
const BADGE_EVENT = 'background:#f97316;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold';
const BADGE_WARN = 'background:#eab308;color:#000;padding:2px 6px;border-radius:3px;font-weight:bold';
const DIM = 'color:#888';

function log(badge, badgeStyle, ...args) {
  console.log(`%c${badge}%c`, badgeStyle, '', ...args);
}

function logGrouped(badge, badgeStyle, title, data) {
  console.groupCollapsed(`%c${badge}%c ${title}`, badgeStyle, 'color:inherit');
  if (data !== undefined) console.log(data);
  console.groupEnd();
}

export function connectDevToolsMCP({ port = 9229 } = {}) {
  let ws = null;
  let connected = false;
  let reconnectTimer = null;
  let reconnectDelay = 1000;
  const MAX_RECONNECT_DELAY = 30000;
  const pendingResponses = new Map();
  let eventCount = 0;
  let hasLoggedDisconnect = false;
  let reconnectAttempts = 0;

  // Startup banner
  console.log(
    '%c⚡ What DevTools MCP %c Client v0.1.0',
    'background:linear-gradient(135deg,#6366f1,#a855f7);color:#fff;padding:4px 10px;border-radius:4px;font-weight:bold;font-size:13px',
    'color:#a855f7;font-weight:bold'
  );
  log('MCP', BADGE, `Connecting to bridge on ws://localhost:${port}`);

  function connect() {
    reconnectAttempts++;
    try {
      ws = new WebSocket(`ws://localhost:${port}`);
    } catch {
      if (reconnectAttempts <= 1) {
        log('MCP', BADGE_WARN, 'Bridge not available — retrying silently in background');
      }
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      connected = true;
      reconnectDelay = 1000;
      hasLoggedDisconnect = false;
      reconnectAttempts = 0;
      log('MCP', BADGE, '🟢 Connected to bridge — AI agent can now inspect this app');

      // Send initial snapshot
      const devtools = window.__WHAT_DEVTOOLS__;
      if (devtools) {
        const snapshot = devtools.getSnapshot();
        send({ type: 'snapshot', data: devtools.safeSerialize(snapshot) });
        const s = snapshot.signals?.length || 0;
        const e = snapshot.effects?.length || 0;
        const c = snapshot.components?.length || 0;
        log('MCP', BADGE, `Sent initial snapshot — ${s} signals, ${e} effects, ${c} components`);
      }

      // Subscribe to devtools events and stream them
      if (devtools) {
        devtools.subscribe((event, data) => {
          eventCount++;
          send({ type: 'event', event, data: devtools.safeSerialize(data) });
        });
        log('MCP', BADGE, 'Subscribed to reactive events — streaming to bridge');
      }
    };

    ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      handleCommand(msg);
    };

    ws.onclose = () => {
      const wasConnected = connected;
      connected = false;
      if (wasConnected && !hasLoggedDisconnect) {
        hasLoggedDisconnect = true;
        log('MCP', BADGE_WARN, '🔴 Disconnected from bridge — will reconnect silently');
      }
      scheduleReconnect();
    };

    ws.onerror = () => {
      // Silence — onclose handles reconnection.
      // Without this, every failed reconnect attempt logs a loud red error.
    };
  }

  function send(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  function handleCommand(msg) {
    const { command, correlationId, args } = msg;
    const devtools = window.__WHAT_DEVTOOLS__;
    let result;

    const cmdNames = {
      'get-snapshot': '📸 Snapshot requested',
      'get-cache': '💾 Cache query',
      'set-signal': '✏️  Signal write',
      'invalidate-cache': '🗑️  Cache invalidation',
    };

    const label = cmdNames[command] || `❓ ${command}`;

    switch (command) {
      case 'get-snapshot': {
        const snapshot = devtools?.getSnapshot() || { signals: [], effects: [], components: [], errors: [] };
        result = devtools?.safeSerialize(snapshot) || snapshot;
        const s = snapshot.signals?.length || 0;
        const e = snapshot.effects?.length || 0;
        const c = snapshot.components?.length || 0;
        logGrouped('AI →', BADGE_CMD, `${label} — returning ${s} signals, ${e} effects, ${c} components`, result);
        break;
      }
      case 'get-cache': {
        let cacheData = [];
        try {
          const core = window.__WHAT_CORE__ || {};
          if (core.__getCacheSnapshot) {
            cacheData = core.__getCacheSnapshot();
          }
        } catch {}
        result = devtools?.safeSerialize(cacheData) || cacheData;
        logGrouped('AI →', BADGE_CMD, `${label} — ${cacheData.length} entries`, result);
        break;
      }
      case 'set-signal': {
        const { signalId, value } = args || {};
        const registries = devtools?._registries;
        if (registries?.signals) {
          const entry = registries.signals.get(signalId);
          if (entry) {
            const prev = entry.ref.peek();
            entry.ref(value);
            result = { previous: devtools.safeSerialize(prev), current: devtools.safeSerialize(value) };
            log('AI →', BADGE_CMD, `${label} — signal #${signalId} "${entry.name}": ${JSON.stringify(prev)} → ${JSON.stringify(value)}`);
          } else {
            result = { error: `Signal ${signalId} not found` };
            log('AI →', BADGE_WARN, `${label} — signal #${signalId} not found`);
          }
        } else {
          result = { error: 'DevTools not available' };
          log('AI →', BADGE_WARN, `${label} — devtools not available`);
        }
        break;
      }
      case 'invalidate-cache': {
        const { key } = args || {};
        try {
          const core = window.__WHAT_CORE__ || {};
          if (core.invalidateQueries) {
            core.invalidateQueries(key);
            result = { success: true, key };
            log('AI →', BADGE_CMD, `${label} — key "${key}" invalidated`);
          } else {
            result = { error: 'invalidateQueries not available' };
            log('AI →', BADGE_WARN, `${label} — invalidateQueries not available`);
          }
        } catch (e) {
          result = { error: e.message };
          log('AI →', BADGE_WARN, `${label} — error: ${e.message}`);
        }
        break;
      }
      default:
        result = { error: `Unknown command: ${command}` };
        log('AI →', BADGE_WARN, `Unknown command: ${command}`);
    }

    if (correlationId) {
      send({ type: 'response', correlationId, data: result });
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    // After 5 failures, go very slow (30s) to avoid console spam
    if (reconnectAttempts === 5 && !hasLoggedDisconnect) {
      log('MCP', BADGE_WARN, `Bridge not available — will retry every 30s. Start the MCP server to connect.`);
      hasLoggedDisconnect = true;
    }
    const delay = reconnectAttempts >= 5 ? MAX_RECONNECT_DELAY : reconnectDelay;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
      connect();
    }, delay);
  }

  function disconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      ws.onclose = null; // prevent reconnect
      ws.close();
      ws = null;
    }
    connected = false;
    log('MCP', BADGE, 'Disconnected');
  }

  connect();

  return {
    disconnect,
    get isConnected() { return connected; },
    get eventCount() { return eventCount; },
  };
}
