/**
 * Unit tests for MCP tools against a mock bridge.
 * Uses InMemoryTransport + MCP Client — no WebSocket needed.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerTools } from '../src/tools.js';

function createMockBridge(opts = {}) {
  const snapshot = opts.snapshot || {
    signals: [
      { id: 1, name: 'count', value: 42 },
      { id: 2, name: 'name', value: 'hello' },
      { id: 3, name: 'internal_props', value: {} },
    ],
    effects: [
      { id: 1, name: 'renderCounter', depSignalIds: [1], runCount: 5, lastRunAt: Date.now() },
      { id: 2, name: 'logEffect', depSignalIds: [2], runCount: 1, lastRunAt: Date.now() },
    ],
    components: [
      { id: 1, name: 'App' },
      { id: 2, name: 'Counter' },
    ],
    errors: opts.errors || [],
  };

  const events = opts.events || [];
  const errors = opts.errorLog || [];
  let connected = opts.connected !== false;
  let commandHandler = opts.commandHandler || null;

  return {
    isConnected: () => connected,
    getSnapshot: () => snapshot,
    refreshSnapshot: async () => snapshot,
    getCacheSnapshot: async () => opts.cache || [],
    getEvents: (since) => since ? events.filter(e => e.timestamp > since) : events,
    getErrors: (since) => since ? errors.filter(e => e.timestamp > since) : errors,
    sendCommand: async (command, args) => {
      if (commandHandler) return commandHandler(command, args);
      if (command === 'set-signal') {
        const sig = snapshot.signals.find(s => s.id === args.signalId);
        if (!sig) return { error: `Signal ${args.signalId} not found` };
        const prev = sig.value;
        sig.value = args.value;
        return { previous: prev, current: args.value };
      }
      if (command === 'invalidate-cache') return { success: true, key: args.key };
      return { error: `Unknown command: ${command}` };
    },
    close: () => {},
    _setConnected: (v) => { connected = v; },
  };
}

async function setupMcp(bridgeOpts) {
  const bridge = createMockBridge(bridgeOpts);
  const server = new McpServer({ name: 'test', version: '0.1.0' });
  registerTools(server, bridge);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.1.0' });

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  return { client, server, bridge };
}

async function callTool(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  const text = result.content[0]?.text;
  return { ...result, parsed: text ? JSON.parse(text) : null };
}

describe('what-devtools-mcp tools', () => {
  let client, server, bridge;

  afterEach(async () => {
    try { await client?.close(); } catch {}
    try { await server?.close(); } catch {}
  });

  describe('what_connection_status', () => {
    it('returns connected status with counts', async () => {
      ({ client, server, bridge } = await setupMcp());
      const { parsed } = await callTool(client, 'what_connection_status');
      assert.equal(parsed.connected, true);
      assert.equal(parsed.signalCount, 3);
      assert.equal(parsed.effectCount, 2);
      assert.equal(parsed.componentCount, 2);
    });

    it('returns disconnected when no browser', async () => {
      ({ client, server, bridge } = await setupMcp({ connected: false }));
      const { parsed } = await callTool(client, 'what_connection_status');
      assert.equal(parsed.connected, false);
    });
  });

  describe('what_signals', () => {
    it('returns all signals', async () => {
      ({ client, server, bridge } = await setupMcp());
      const { parsed } = await callTool(client, 'what_signals');
      assert.equal(parsed.count, 3);
      assert.equal(parsed.signals[0].name, 'count');
      assert.equal(parsed.signals[0].value, 42);
    });

    it('filters by name regex', async () => {
      ({ client, server, bridge } = await setupMcp());
      const { parsed } = await callTool(client, 'what_signals', { filter: 'count' });
      assert.equal(parsed.count, 1);
      assert.equal(parsed.signals[0].name, 'count');
    });

    it('filters by ID', async () => {
      ({ client, server, bridge } = await setupMcp());
      const { parsed } = await callTool(client, 'what_signals', { id: 2 });
      assert.equal(parsed.count, 1);
      assert.equal(parsed.signals[0].name, 'name');
    });

    it('returns error when not connected', async () => {
      ({ client, server, bridge } = await setupMcp({ connected: false }));
      const result = await callTool(client, 'what_signals');
      assert.equal(result.parsed.error, 'No browser connected');
    });
  });

  describe('what_effects', () => {
    it('returns all effects with dep info', async () => {
      ({ client, server, bridge } = await setupMcp());
      const { parsed } = await callTool(client, 'what_effects');
      assert.equal(parsed.count, 2);
      assert.deepEqual(parsed.effects[0].depSignalIds, [1]);
      assert.equal(parsed.effects[0].runCount, 5);
    });

    it('filters by minRunCount', async () => {
      ({ client, server, bridge } = await setupMcp());
      const { parsed } = await callTool(client, 'what_effects', { minRunCount: 3 });
      assert.equal(parsed.count, 1);
      assert.equal(parsed.effects[0].name, 'renderCounter');
    });
  });

  describe('what_errors', () => {
    it('returns captured errors', async () => {
      const now = Date.now();
      ({ client, server, bridge } = await setupMcp({
        errorLog: [
          { message: 'Test error', type: 'effect', timestamp: now - 1000 },
          { message: 'Another error', type: 'effect', timestamp: now },
        ],
      }));
      const { parsed } = await callTool(client, 'what_errors');
      assert.equal(parsed.count, 2);
    });

    it('filters by since timestamp', async () => {
      const now = Date.now();
      ({ client, server, bridge } = await setupMcp({
        errorLog: [
          { message: 'Old error', type: 'effect', timestamp: now - 5000 },
          { message: 'New error', type: 'effect', timestamp: now },
        ],
      }));
      const { parsed } = await callTool(client, 'what_errors', { since: now - 1000 });
      assert.equal(parsed.count, 1);
      assert.equal(parsed.errors[0].message, 'New error');
    });
  });

  describe('what_set_signal', () => {
    it('sets signal value and returns prev/current', async () => {
      ({ client, server, bridge } = await setupMcp());
      const { parsed } = await callTool(client, 'what_set_signal', { signalId: 1, value: 100 });
      assert.equal(parsed.success, true);
      assert.equal(parsed.previous, 42);
      assert.equal(parsed.current, 100);
    });

    it('returns error for unknown signal', async () => {
      ({ client, server, bridge } = await setupMcp());
      const { parsed } = await callTool(client, 'what_set_signal', { signalId: 999, value: 0 });
      assert.ok(parsed.error);
    });
  });

  describe('what_watch', () => {
    it('collects events over duration', async () => {
      const now = Date.now();
      ({ client, server, bridge } = await setupMcp({
        events: [
          { event: 'signal:updated', data: { id: 1 }, timestamp: now + 50 },
          { event: 'signal:updated', data: { id: 1 }, timestamp: now + 100 },
        ],
      }));
      const { parsed } = await callTool(client, 'what_watch', { duration: 200 });
      assert.equal(parsed.eventCount, 2);
    });
  });

  describe('what_cache', () => {
    it('returns cache entries', async () => {
      ({ client, server, bridge } = await setupMcp({
        cache: [
          { key: '/api/users', data: [{ id: 1, name: 'Alice' }], error: null, isValidating: false },
        ],
      }));
      const { parsed } = await callTool(client, 'what_cache');
      assert.equal(parsed.count, 1);
      assert.equal(parsed.entries[0].key, '/api/users');
    });
  });

  describe('what_components', () => {
    it('returns mounted components', async () => {
      ({ client, server, bridge } = await setupMcp());
      const { parsed } = await callTool(client, 'what_components');
      assert.equal(parsed.count, 2);
      assert.equal(parsed.components[0].name, 'App');
    });
  });
});
