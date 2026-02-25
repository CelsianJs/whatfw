/**
 * MCP tool definitions and handlers for what-devtools-mcp.
 * 10 tools: 7 read, 2 write, 1 observe.
 */

import { z } from 'zod';

export function registerTools(server, bridge) {
  // --- Read Tools ---

  server.tool(
    'what_connection_status',
    'Check if a What Framework app is connected via WebSocket',
    {},
    async () => {
      const connected = bridge.isConnected();
      const snapshot = bridge.getSnapshot();
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            connected,
            hasSnapshot: snapshot !== null,
            signalCount: snapshot?.signals?.length || 0,
            effectCount: snapshot?.effects?.length || 0,
            componentCount: snapshot?.components?.length || 0,
          }, null, 2),
        }],
      };
    }
  );

  server.tool(
    'what_signals',
    'List all reactive signals with current values. Filter by name regex or ID.',
    {
      filter: z.string().optional().describe('Regex pattern to filter signal names'),
      id: z.number().optional().describe('Get a specific signal by ID'),
    },
    async ({ filter, id }) => {
      if (!bridge.isConnected()) {
        return noConnection('what_signals');
      }
      let snapshot;
      try { snapshot = await bridge.refreshSnapshot(); } catch {
        snapshot = bridge.getSnapshot();
      }
      if (!snapshot) return noSnapshot();

      let signals = snapshot.signals || [];

      if (id != null) {
        signals = signals.filter(s => s.id === id);
      } else if (filter) {
        try {
          const re = new RegExp(filter, 'i');
          signals = signals.filter(s => re.test(s.name));
        } catch {
          return error(`Invalid regex: ${filter}`);
        }
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ count: signals.length, signals }, null, 2),
        }],
      };
    }
  );

  server.tool(
    'what_effects',
    'List all active effects with dependency signal IDs, run counts, and timing',
    {
      minRunCount: z.number().optional().describe('Only show effects with runCount >= this value'),
    },
    async ({ minRunCount }) => {
      if (!bridge.isConnected()) return noConnection('what_effects');
      let snapshot;
      try { snapshot = await bridge.refreshSnapshot(); } catch {
        snapshot = bridge.getSnapshot();
      }
      if (!snapshot) return noSnapshot();

      let effects = snapshot.effects || [];
      if (minRunCount != null) {
        effects = effects.filter(e => (e.runCount || 0) >= minRunCount);
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ count: effects.length, effects }, null, 2),
        }],
      };
    }
  );

  server.tool(
    'what_components',
    'List all mounted What Framework components',
    {},
    async () => {
      if (!bridge.isConnected()) return noConnection('what_components');
      let snapshot;
      try { snapshot = await bridge.refreshSnapshot(); } catch {
        snapshot = bridge.getSnapshot();
      }
      if (!snapshot) return noSnapshot();

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            count: (snapshot.components || []).length,
            components: snapshot.components || [],
          }, null, 2),
        }],
      };
    }
  );

  server.tool(
    'what_snapshot',
    'Get a full state snapshot (signals, effects, components, errors). Refreshes from browser.',
    {},
    async () => {
      if (!bridge.isConnected()) return noConnection('what_snapshot');
      let snapshot;
      try { snapshot = await bridge.refreshSnapshot(); } catch {
        snapshot = bridge.getSnapshot();
      }
      if (!snapshot) return noSnapshot();

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(snapshot, null, 2),
        }],
      };
    }
  );

  server.tool(
    'what_errors',
    'Get captured runtime errors with context. Filter by timestamp.',
    {
      since: z.number().optional().describe('Only errors after this Unix timestamp (ms)'),
    },
    async ({ since }) => {
      if (!bridge.isConnected()) return noConnection('what_errors');
      const errors = bridge.getErrors(since);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ count: errors.length, errors }, null, 2),
        }],
      };
    }
  );

  server.tool(
    'what_cache',
    'Inspect SWR/useQuery cache entries from the running app',
    {},
    async () => {
      if (!bridge.isConnected()) return noConnection('what_cache');
      try {
        const cache = await bridge.getCacheSnapshot();
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ count: Array.isArray(cache) ? cache.length : 0, entries: cache }, null, 2),
          }],
        };
      } catch (e) {
        return error(e.message);
      }
    }
  );

  // --- Write Tools ---

  server.tool(
    'what_set_signal',
    'Set a signal value in the running app. Returns previous and new values.',
    {
      signalId: z.number().describe('The signal ID to update (from what_signals)'),
      value: z.any().describe('The new value to set (JSON-compatible)'),
    },
    async ({ signalId, value }) => {
      if (!bridge.isConnected()) return noConnection('what_set_signal');
      try {
        const result = await bridge.sendCommand('set-signal', { signalId, value });
        if (result.error) return error(result.error);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ success: true, signalId, ...result }, null, 2),
          }],
        };
      } catch (e) {
        return error(e.message);
      }
    }
  );

  server.tool(
    'what_invalidate_cache',
    'Force-refresh a cache key in the running app',
    {
      key: z.string().describe('The cache key to invalidate'),
    },
    async ({ key }) => {
      if (!bridge.isConnected()) return noConnection('what_invalidate_cache');
      try {
        const result = await bridge.sendCommand('invalidate-cache', { key });
        if (result.error) return error(result.error);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ success: true, key }, null, 2),
          }],
        };
      } catch (e) {
        return error(e.message);
      }
    }
  );

  // --- Observe Tool ---

  server.tool(
    'what_watch',
    'Watch for signal/effect changes over a time window. Collects events for the specified duration.',
    {
      duration: z.number().optional().default(3000).describe('Duration in ms to collect events (default: 3000, max: 30000)'),
      filter: z.string().optional().describe('Regex to filter event names (e.g. "signal:updated")'),
    },
    async ({ duration, filter }) => {
      if (!bridge.isConnected()) return noConnection('what_watch');

      const ms = Math.min(Math.max(duration || 3000, 100), 30000);
      const startTime = Date.now();

      // Wait for the duration
      await new Promise(resolve => setTimeout(resolve, ms));

      // Collect events that occurred during the window
      let events = bridge.getEvents(startTime);

      if (filter) {
        try {
          const re = new RegExp(filter, 'i');
          events = events.filter(e => re.test(e.event));
        } catch {
          return error(`Invalid regex: ${filter}`);
        }
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            duration: ms,
            eventCount: events.length,
            events: events.slice(0, 200), // cap to prevent huge payloads
          }, null, 2),
        }],
      };
    }
  );
}

// Helper responses
function noConnection(tool) {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        error: 'No browser connected',
        hint: `No What Framework app is connected to the devtools bridge. Make sure your app is running with the what-devtools-mcp Vite plugin enabled, or manually call connectDevToolsMCP() in your app.`,
        tool,
      }, null, 2),
    }],
    isError: true,
  };
}

function noSnapshot() {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        error: 'No snapshot available',
        hint: 'The browser is connected but has not sent a state snapshot yet. Try refreshing the page.',
      }, null, 2),
    }],
    isError: true,
  };
}

function error(message) {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: message }, null, 2) }],
    isError: true,
  };
}
