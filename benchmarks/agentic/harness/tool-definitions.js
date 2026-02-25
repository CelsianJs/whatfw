/**
 * Tool definitions for agentic debugging benchmark.
 * Defines baseline tools (file ops, bash, playwright) and MCP tools.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export function createBaselineTools(fixtureDir, page) {
  return {
    read_file: {
      description: 'Read the contents of a file',
      parameters: {
        path: { type: 'string', description: 'File path relative to fixture directory' },
      },
      execute: async ({ path }) => {
        const fullPath = join(fixtureDir, path);
        try {
          return readFileSync(fullPath, 'utf-8');
        } catch (e) {
          return `Error: ${e.message}`;
        }
      },
    },

    edit_file: {
      description: 'Replace text in a file',
      parameters: {
        path: { type: 'string', description: 'File path relative to fixture directory' },
        old_text: { type: 'string', description: 'Text to find and replace' },
        new_text: { type: 'string', description: 'Replacement text' },
      },
      execute: async ({ path, old_text, new_text }) => {
        const fullPath = join(fixtureDir, path);
        try {
          let content = readFileSync(fullPath, 'utf-8');
          if (!content.includes(old_text)) return 'Error: old_text not found in file';
          content = content.replace(old_text, new_text);
          writeFileSync(fullPath, content);
          return 'File updated successfully';
        } catch (e) {
          return `Error: ${e.message}`;
        }
      },
    },

    playwright_screenshot: {
      description: 'Take a screenshot of the current page',
      parameters: {},
      execute: async () => {
        const buffer = await page.screenshot({ encoding: 'base64' });
        return `[Screenshot captured: ${buffer.length} bytes base64]`;
      },
    },

    playwright_console: {
      description: 'Get recent console messages from the browser',
      parameters: {
        count: { type: 'number', description: 'Number of recent messages (default: 20)' },
      },
      execute: async ({ count = 20 }) => {
        // Console messages are collected by the harness
        return page._consoleLogs
          ? page._consoleLogs.slice(-count).join('\n')
          : 'No console logs captured';
      },
    },

    playwright_evaluate: {
      description: 'Run JavaScript in the browser and return the result',
      parameters: {
        expression: { type: 'string', description: 'JavaScript expression to evaluate' },
      },
      execute: async ({ expression }) => {
        try {
          const result = await page.evaluate(expression);
          return JSON.stringify(result, null, 2);
        } catch (e) {
          return `Error: ${e.message}`;
        }
      },
    },
  };
}

export function createMcpTools(page) {
  // MCP tools are simulated via page.evaluate() against window.__WHAT_DEVTOOLS__
  return {
    what_signals: {
      description: 'List all reactive signals with current values',
      parameters: {
        filter: { type: 'string', description: 'Regex to filter signal names' },
      },
      execute: async ({ filter } = {}) => {
        return page.evaluate((f) => {
          const dt = window.__WHAT_DEVTOOLS__;
          if (!dt) return JSON.stringify({ error: 'DevTools not installed' });
          let signals = dt.signals;
          if (f) {
            const re = new RegExp(f, 'i');
            signals = signals.filter(s => re.test(s.name));
          }
          return JSON.stringify({ count: signals.length, signals }, null, 2);
        }, filter);
      },
    },

    what_effects: {
      description: 'List effects with dependency info and run counts',
      parameters: {},
      execute: async () => {
        return page.evaluate(() => {
          const dt = window.__WHAT_DEVTOOLS__;
          if (!dt) return JSON.stringify({ error: 'DevTools not installed' });
          return JSON.stringify({ count: dt.effects.length, effects: dt.effects }, null, 2);
        });
      },
    },

    what_components: {
      description: 'List mounted components',
      parameters: {},
      execute: async () => {
        return page.evaluate(() => {
          const dt = window.__WHAT_DEVTOOLS__;
          if (!dt) return JSON.stringify({ error: 'DevTools not installed' });
          return JSON.stringify({ count: dt.components.length, components: dt.components }, null, 2);
        });
      },
    },

    what_snapshot: {
      description: 'Full state snapshot (signals, effects, components, errors)',
      parameters: {},
      execute: async () => {
        return page.evaluate(() => {
          const dt = window.__WHAT_DEVTOOLS__;
          if (!dt) return JSON.stringify({ error: 'DevTools not installed' });
          return JSON.stringify(dt.getSnapshot(), null, 2);
        });
      },
    },

    what_errors: {
      description: 'Runtime errors with context',
      parameters: {},
      execute: async () => {
        return page.evaluate(() => {
          const dt = window.__WHAT_DEVTOOLS__;
          if (!dt) return JSON.stringify({ error: 'DevTools not installed' });
          const errors = dt.errors || [];
          return JSON.stringify({ count: errors.length, errors }, null, 2);
        });
      },
    },

    what_cache: {
      description: 'SWR/useQuery cache entries',
      parameters: {},
      execute: async () => {
        return page.evaluate(() => {
          const dt = window.__WHAT_DEVTOOLS__;
          if (!dt) return JSON.stringify({ error: 'DevTools not installed' });
          // Try to access cache snapshot if available
          return JSON.stringify({ entries: [] }, null, 2);
        });
      },
    },

    what_set_signal: {
      description: 'Set a signal value by ID',
      parameters: {
        signalId: { type: 'number', description: 'Signal ID' },
        value: { description: 'New value' },
      },
      execute: async ({ signalId, value }) => {
        return page.evaluate(({ id, val }) => {
          const dt = window.__WHAT_DEVTOOLS__;
          if (!dt) return JSON.stringify({ error: 'DevTools not installed' });
          const reg = dt._registries;
          if (!reg?.signals) return JSON.stringify({ error: 'No registries' });
          const entry = reg.signals.get(id);
          if (!entry) return JSON.stringify({ error: `Signal ${id} not found` });
          const prev = entry.ref.peek();
          entry.ref(val);
          return JSON.stringify({ success: true, previous: prev, current: val }, null, 2);
        }, { id: signalId, val: value });
      },
    },

    what_watch: {
      description: 'Watch for signal changes over a time window',
      parameters: {
        duration: { type: 'number', description: 'Duration in ms (default: 2000)' },
      },
      execute: async ({ duration = 2000 }) => {
        return page.evaluate((ms) => {
          return new Promise((resolve) => {
            const dt = window.__WHAT_DEVTOOLS__;
            if (!dt) return resolve(JSON.stringify({ error: 'DevTools not installed' }));
            const events = [];
            const unsub = dt.subscribe((event, data) => {
              events.push({ event, data, timestamp: Date.now() });
            });
            setTimeout(() => {
              unsub();
              resolve(JSON.stringify({ duration: ms, eventCount: events.length, events }, null, 2));
            }, ms);
          });
        }, duration);
      },
    },
  };
}

export function toolsToAnthropicFormat(tools) {
  return Object.entries(tools).map(([name, def]) => ({
    name,
    description: def.description,
    input_schema: {
      type: 'object',
      properties: def.parameters || {},
    },
  }));
}
