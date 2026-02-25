/**
 * Node.js WebSocket server + state bridge.
 * Receives state snapshots and events from the browser client,
 * provides query API for the MCP tools.
 */

import { WebSocketServer } from 'ws';

const MAX_EVENT_LOG = 1000;
const MAX_ERROR_LOG = 100;

export function createBridge({ port = 9229 } = {}) {
  let latestSnapshot = null;
  const eventLog = [];
  const errorLog = [];
  let browserSocket = null;
  let correlationCounter = 0;
  const pendingCommands = new Map();

  // Snapshot dedup cache (100ms)
  let cachedSnapshot = null;
  let cacheTime = 0;
  const SNAPSHOT_CACHE_MS = 100;

  // Baseline snapshot for diff tool
  let baselineSnapshot = null;

  const wss = new WebSocketServer({ port });

  wss.on('connection', (ws) => {
    browserSocket = ws;

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      switch (msg.type) {
        case 'snapshot':
          latestSnapshot = msg.data;
          break;
        case 'event':
          eventLog.push({ event: msg.event, data: msg.data, timestamp: Date.now() });
          if (eventLog.length > MAX_EVENT_LOG) eventLog.shift();
          // Track errors separately
          if (msg.event === 'error:captured') {
            errorLog.push({ ...msg.data, timestamp: Date.now() });
            if (errorLog.length > MAX_ERROR_LOG) errorLog.shift();
          }
          break;
        case 'events':
          for (const item of msg.batch || []) {
            eventLog.push({ event: item.event, data: item.data, timestamp: Date.now() });
            if (eventLog.length > MAX_EVENT_LOG) eventLog.shift();
            if (item.event === 'error:captured') {
              errorLog.push({ ...item.data, timestamp: Date.now() });
              if (errorLog.length > MAX_ERROR_LOG) errorLog.shift();
            }
          }
          break;
        case 'response': {
          const pending = pendingCommands.get(msg.correlationId);
          if (pending) {
            pendingCommands.delete(msg.correlationId);
            pending.resolve(msg.data);
          }
          break;
        }
      }
    });

    ws.on('close', () => {
      if (browserSocket === ws) browserSocket = null;
      // Reject all pending commands
      for (const [id, pending] of pendingCommands) {
        pending.reject(new Error('Browser disconnected'));
        pendingCommands.delete(id);
      }
    });
  });

  function isConnected() {
    return browserSocket !== null && browserSocket.readyState === 1; // WebSocket.OPEN
  }

  function sendCommand(command, args = {}, timeout = 5000) {
    return new Promise((resolve, reject) => {
      if (!isConnected()) {
        return reject(new Error('No browser connected'));
      }
      const correlationId = `cmd_${++correlationCounter}`;
      const timer = setTimeout(() => {
        pendingCommands.delete(correlationId);
        reject(new Error(`Command '${command}' timed out after ${timeout}ms`));
      }, timeout);

      pendingCommands.set(correlationId, {
        resolve: (data) => { clearTimeout(timer); resolve(data); },
        reject: (err) => { clearTimeout(timer); reject(err); },
      });

      browserSocket.send(JSON.stringify({ command, correlationId, args }));
    });
  }

  async function refreshSnapshot() {
    const data = await sendCommand('get-snapshot');
    latestSnapshot = data;
    return data;
  }

  async function getOrRefreshSnapshot() {
    const now = Date.now();
    if (cachedSnapshot && now - cacheTime < SNAPSHOT_CACHE_MS) return cachedSnapshot;
    try {
      cachedSnapshot = await refreshSnapshot();
      cacheTime = now;
      return cachedSnapshot;
    } catch {
      return latestSnapshot;
    }
  }

  async function getCacheSnapshot() {
    return sendCommand('get-cache');
  }

  function getSnapshot() {
    return latestSnapshot;
  }

  function saveBaseline() {
    baselineSnapshot = latestSnapshot ? JSON.parse(JSON.stringify(latestSnapshot)) : null;
    return !!baselineSnapshot;
  }

  function getBaseline() {
    return baselineSnapshot;
  }

  function getEvents(since) {
    if (since) return eventLog.filter(e => e.timestamp > since);
    return eventLog.slice();
  }

  function getErrors(since) {
    if (since) return errorLog.filter(e => e.timestamp > since);
    return errorLog.slice();
  }

  function close() {
    for (const [id, pending] of pendingCommands) {
      pending.reject(new Error('Bridge closing'));
      pendingCommands.delete(id);
    }
    wss.close();
  }

  return {
    getSnapshot,
    getOrRefreshSnapshot,
    getEvents,
    getErrors,
    isConnected,
    sendCommand,
    refreshSnapshot,
    getCacheSnapshot,
    saveBaseline,
    getBaseline,
    close,
  };
}
