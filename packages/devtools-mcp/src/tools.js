/**
 * MCP tool definitions and handlers for what-devtools-mcp.
 * 10 tools: 7 read, 2 write, 1 observe.
 */

import { z } from 'zod';

export function registerTools(server, bridge) {
  // --- Helpers ---

  /** Build a signalId -> name lookup map from any snapshot */
  function buildSignalNameMap(snapshot) {
    const map = {};
    for (const s of snapshot?.signals || []) map[s.id] = s.name;
    return map;
  }

  /** Build a compact component tree string like "App > [Header, Main > [Counter, Form]]" */
  function buildComponentTreeSummary(components) {
    if (!components || components.length === 0) return { tree: '(empty)', depth: 0 };
    // Attempt to build tree from parent references; fallback to flat list
    const byId = {};
    const roots = [];
    for (const c of components) {
      byId[c.id] = { ...c, children: [] };
    }
    for (const c of components) {
      if (c.parentId != null && byId[c.parentId]) {
        byId[c.parentId].children.push(byId[c.id]);
      } else {
        roots.push(byId[c.id]);
      }
    }
    function summarize(node, depth) {
      if (depth > 5) return '...';
      const name = node.name || `component_${node.id}`;
      if (node.children.length === 0) return name;
      const kids = node.children.map(c => summarize(c, depth + 1)).join(', ');
      return `${name} > [${kids}]`;
    }
    // Compute max depth
    function maxDepth(node, d) {
      if (node.children.length === 0) return d;
      return Math.max(...node.children.map(c => maxDepth(c, d + 1)));
    }
    const depth = roots.length > 0 ? Math.max(...roots.map(r => maxDepth(r, 1))) : 0;
    const tree = roots.map(r => summarize(r, 0)).join(', ');
    return { tree, depth };
  }

  // --- Read Tools ---

  server.tool(
    'what_connection_status',
    'Check if a What Framework app is connected via WebSocket',
    {},
    async () => {
      const connected = bridge.isConnected();
      const snapshot = bridge.getSnapshot();
      const signalCount = snapshot?.signals?.length || 0;
      const effectCount = snapshot?.effects?.length || 0;
      const componentCount = snapshot?.components?.length || 0;

      let summary;
      if (!connected) {
        summary = 'No browser connected. Start your app with the what-devtools-mcp Vite plugin and refresh the page.';
      } else if (!snapshot) {
        summary = 'Browser connected but no snapshot received yet. Try refreshing the page.';
      } else {
        summary = `Connected. App has ${signalCount} signals, ${effectCount} effects, ${componentCount} components.`;
      }

      const result = {
        summary,
        connected,
        hasSnapshot: snapshot !== null,
        signalCount,
        effectCount,
        componentCount,
      };

      if (!connected) {
        result.nextSteps = [
          'Make sure your app is running with the what-devtools-mcp Vite plugin',
          'Check that the MCP bridge server is running (npx what-devtools-mcp)',
          'Try refreshing the browser page',
        ];
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2),
        }],
      };
    }
  );

  server.tool(
    'what_signals',
    'List all reactive signals with current values. Filter by name regex or ID.',
    {
      filter: z.string().optional().describe('Regex to filter signal names (ignored if id is set)'),
      id: z.number().optional().describe('Get a specific signal by ID (takes precedence over filter)'),
    },
    async ({ filter, id }) => {
      if (!bridge.isConnected()) {
        return noConnection('what_signals');
      }
      const snapshot = await bridge.getOrRefreshSnapshot();
      if (!snapshot) return noSnapshot();

      let signals = snapshot.signals || [];
      const totalCount = signals.length;

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

      // Build summary
      const valuePreviews = signals.slice(0, 5).map(s => {
        const val = typeof s.value === 'string' ? `'${s.value}'` : JSON.stringify(s.value);
        const truncated = val && val.length > 40 ? val.slice(0, 37) + '...' : val;
        return `${s.name}=${truncated}`;
      });
      const filterNote = id != null ? ` 1 matched id=${id}.` : filter ? ` ${signals.length} match filter '${filter}'.` : '';
      const valuesNote = valuePreviews.length > 0 ? ` Values: ${valuePreviews.join(', ')}` : '';
      const moreNote = signals.length > 5 ? `, ... (${signals.length - 5} more)` : '';
      const summary = `${totalCount} signals total.${filterNote}${valuesNote}${moreNote}`;

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ summary, count: signals.length, signals }, null, 2),
        }],
      };
    }
  );

  server.tool(
    'what_effects',
    'List all active effects with dependency signal IDs, run counts, and timing',
    {
      minRunCount: z.number().optional().describe('Only show effects with runCount >= this value'),
      filter: z.string().optional().describe('Regex pattern to filter effect names'),
      depSignalId: z.number().optional().describe('Find effects that depend on this signal ID'),
    },
    async ({ minRunCount, filter, depSignalId }) => {
      if (!bridge.isConnected()) return noConnection('what_effects');
      const snapshot = await bridge.getOrRefreshSnapshot();
      if (!snapshot) return noSnapshot();

      let effects = snapshot.effects || [];
      const totalCount = effects.length;

      if (minRunCount != null) {
        effects = effects.filter(e => (e.runCount || 0) >= minRunCount);
      }

      if (filter) {
        try {
          const re = new RegExp(filter, 'i');
          effects = effects.filter(e => re.test(e.name || ''));
        } catch {
          return error(`Invalid regex: ${filter}`);
        }
      }

      if (depSignalId != null) {
        effects = effects.filter(e => (e.depSignalIds || []).includes(depSignalId));
      }

      // Resolve dependency signal IDs to names
      const signalNames = buildSignalNameMap(snapshot);
      effects = effects.map(e => ({
        ...e,
        depSignalNames: (e.depSignalIds || []).map(sid => signalNames[sid] || `signal_${sid}`),
      }));

      // Build summary
      const hotEffects = effects.filter(e => (e.runCount || 0) >= 50);
      const hotNote = hotEffects.length > 0
        ? ` ${hotEffects.length} have run 50+ times (${hotEffects.slice(0, 3).map(e => e.name || `effect_${e.id}`).join(', ')}) — may indicate hot paths.`
        : '';
      const summary = `${totalCount} effects tracked. ${effects.length} returned after filters.${hotNote}`;

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ summary, count: effects.length, effects }, null, 2),
        }],
      };
    }
  );

  server.tool(
    'what_components',
    'List all mounted What Framework components',
    {
      filter: z.string().optional().describe('Regex pattern to filter component names'),
    },
    async ({ filter }) => {
      if (!bridge.isConnected()) return noConnection('what_components');
      const snapshot = await bridge.getOrRefreshSnapshot();
      if (!snapshot) return noSnapshot();

      let components = snapshot.components || [];
      const totalCount = components.length;

      if (filter) {
        try {
          const re = new RegExp(filter, 'i');
          components = components.filter(c => re.test(c.name || ''));
        } catch {
          return error(`Invalid regex: ${filter}`);
        }
      }

      // Build tree summary
      const { tree, depth } = buildComponentTreeSummary(components);
      const summary = `${totalCount} components mounted. Tree depth: ${depth}. Root: ${tree}`;

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            summary,
            count: components.length,
            components,
          }, null, 2),
        }],
      };
    }
  );

  server.tool(
    'what_snapshot',
    'Get a full state snapshot (signals, effects, components, errors). Refreshes from browser.',
    {
      maxSignals: z.number().optional().default(100).describe('Max signals to return (default: 100)'),
      maxEffects: z.number().optional().default(100).describe('Max effects to return (default: 100)'),
    },
    async ({ maxSignals, maxEffects }) => {
      if (!bridge.isConnected()) return noConnection('what_snapshot');
      const snapshot = await bridge.getOrRefreshSnapshot();
      if (!snapshot) return noSnapshot();

      const allSignals = snapshot.signals || [];
      const allEffects = snapshot.effects || [];
      const allComponents = snapshot.components || [];
      const allErrors = bridge.getErrors();

      // Detect hot effects
      const hotEffects = allEffects
        .filter(e => (e.runCount || 0) >= 50)
        .map(e => ({ id: e.id, name: e.name, runCount: e.runCount }));

      const summaryObj = {
        signals: allSignals.length,
        effects: allEffects.length,
        components: allComponents.length,
        errors: allErrors.length,
        hotEffects,
      };

      // Truncation
      const truncatedSignals = allSignals.length > maxSignals;
      const truncatedEffects = allEffects.length > maxEffects;
      const signals = truncatedSignals ? allSignals.slice(0, maxSignals) : allSignals;
      const effects = truncatedEffects ? allEffects.slice(0, maxEffects) : allEffects;

      const result = {
        summary: summaryObj,
        signals,
        effects,
        components: allComponents,
      };

      if (truncatedSignals || truncatedEffects) {
        result.truncated = true;
        result.totalCounts = {
          signals: allSignals.length,
          effects: allEffects.length,
        };
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2),
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

      // Build summary
      let summary;
      if (errors.length === 0) {
        summary = 'No errors captured.';
      } else {
        const mostRecent = errors[errors.length - 1];
        const ageMs = Date.now() - (mostRecent.timestamp || 0);
        const ageSec = Math.round(ageMs / 1000);
        const ageStr = ageSec < 60 ? `${ageSec}s ago` : `${Math.round(ageSec / 60)}m ago`;
        const errorType = mostRecent.message ? mostRecent.message.split(':')[0] : 'Error';
        const effectName = mostRecent.effectName || mostRecent.effect || 'unknown';
        summary = `${errors.length} errors captured. Most recent: ${errorType} in effect '${effectName}' (${ageStr}).`;
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            summary,
            count: errors.length,
            errors,
            nextSteps: [
              'Use what_signals to check signal values referenced in the error stack traces',
              'Use what_effects to inspect the failing effect\'s dependencies',
              'Use what_watch to observe if the error recurs',
            ],
          }, null, 2),
        }],
      };
    }
  );

  server.tool(
    'what_cache',
    'Inspect SWR/useQuery cache entries from the running app',
    {
      key: z.string().optional().describe('Filter cache entries by key (substring match)'),
    },
    async ({ key }) => {
      if (!bridge.isConnected()) return noConnection('what_cache');
      try {
        let cache = await bridge.getCacheSnapshot();
        const entries = Array.isArray(cache) ? cache : [];

        let filtered = entries;
        if (key) {
          filtered = entries.filter(e => (e.key || '').includes(key));
        }

        // Build summary
        const staleEntries = filtered.filter(e => {
          if (!e.timestamp) return false;
          return Date.now() - e.timestamp > 30000;
        });
        const keys = filtered.slice(0, 5).map(e => e.key).filter(Boolean);
        const moreNote = filtered.length > 5 ? `, ... (${filtered.length - 5} more)` : '';
        const staleNote = staleEntries.length > 0 ? ` ${staleEntries.length} stale (> 30s old).` : '';
        const keyNote = keys.length > 0 ? ` Keys: ${keys.join(', ')}${moreNote}` : '';
        const summary = `${filtered.length} cache entries.${staleNote}${keyNote}`;

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ summary, count: filtered.length, entries: filtered }, null, 2),
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

        const summary = `Signal ${signalId} updated. Previous: ${JSON.stringify(result.previousValue)}, New: ${JSON.stringify(result.newValue ?? value)}`;

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ summary, success: true, signalId, ...result }, null, 2),
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

        const summary = `Cache key '${key}' invalidated successfully.`;

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ summary, success: true, key }, null, 2),
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
    'Watch for reactive changes over a time window. Blocks for the specified duration, then returns collected events. Event types: signal:created, signal:updated, signal:disposed, effect:created, effect:run, effect:disposed, error:captured, component:mounted, component:unmounted',
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

      // Build event type breakdown
      const typeCounts = {};
      for (const e of events) {
        typeCounts[e.event] = (typeCounts[e.event] || 0) + 1;
      }
      const breakdown = Object.entries(typeCounts).map(([type, count]) => `${count} ${type}`).join(', ');
      const summary = `Collected ${events.length} events in ${ms}ms.${breakdown ? ' ' + breakdown + '.' : ' No events observed.'}`;

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            summary,
            duration: ms,
            eventCount: events.length,
            typeCounts,
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
        nextSteps: [
          'Make sure your app is running with the what-devtools-mcp Vite plugin',
          'Check that the MCP bridge server is running (npx what-devtools-mcp)',
          'Try refreshing the browser page',
        ],
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
        nextSteps: [
          'Refresh the browser page to trigger a new snapshot',
          'Check the browser console for connection errors',
        ],
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
