# What Framework DevTools MCP Server — Design Document

## The Idea

AI agents (Claude Code, Cursor, Windsurf) debugging a What Framework app can't see what's happening at runtime. They read code, take screenshots, and guess. **DevTools MCP** gives them direct access to live app state — signals, effects, components, errors, cache — through MCP tools.

No other framework has this. What becomes the first **agent-native** frontend framework.

## Architecture

```
┌──────────────────────────────────────────────────┐
│  Browser (What Framework App)                     │
│                                                   │
│  ┌─────────────┐    ┌──────────────────────────┐ │
│  │ what-core    │───▶│ what-devtools            │ │
│  │ (signals,    │    │ (registry, hooks,        │ │
│  │  effects)    │    │  event emitter)          │ │
│  └─────────────┘    └──────────┬───────────────┘ │
│                                │ WebSocket        │
│                                ▼                  │
│                     ┌──────────────────────────┐  │
│                     │ DevTools WS Client       │  │
│                     │ (connects to MCP bridge) │  │
│                     └──────────┬───────────────┘  │
└────────────────────────────────┼──────────────────┘
                                 │ ws://localhost:9229
┌────────────────────────────────┼──────────────────┐
│  Node.js Process               │                   │
│                                ▼                   │
│  ┌──────────────────────────────────────────────┐ │
│  │ what-devtools-mcp                             │ │
│  │                                               │ │
│  │  ┌──────────┐    ┌─────────────────────────┐ │ │
│  │  │ WS Server │───▶│ State Bridge            │ │ │
│  │  │ :9229     │    │ (signals, effects,      │ │ │
│  │  └──────────┘    │  components, errors,     │ │ │
│  │                   │  cache snapshots)        │ │ │
│  │  ┌──────────┐    └─────────────────────────┘ │ │
│  │  │ MCP Server│                                │ │
│  │  │ (stdio)   │◀── Claude Code / Cursor / etc  │ │
│  │  └──────────┘                                 │ │
│  └──────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────┘
```

### Why WebSocket bridge?

MCP tools run in Node.js (stdio). The app runs in the browser. We need a bridge:

1. **Browser side**: Tiny WS client injected by devtools, sends state snapshots and events
2. **Node side**: WS server receives browser state, MCP tools query it
3. **Port 9229**: Chosen to match Node.js inspect convention (familiar)

### Why not HTTP polling?

- WS gives real-time event streaming (signal changes, errors as they happen)
- Agents can "watch" signals — get notified when values change
- HTTP polling would miss events between polls

## MCP Tools

### Read Tools (Query State)

#### `what_signals`
List all tracked signals with current values.

```json
{
  "name": "what_signals",
  "description": "List all reactive signals in the running What Framework app with their current values",
  "inputSchema": {
    "type": "object",
    "properties": {
      "filter": { "type": "string", "description": "Filter by signal name (regex)" },
      "id": { "type": "number", "description": "Get a specific signal by ID" }
    }
  }
}
```

**Returns:**
```json
{
  "signals": [
    { "id": 1, "name": "count", "value": 42, "createdAt": 1708345200000, "subscriberCount": 3 },
    { "id": 2, "name": "user", "value": { "name": "Kirby", "role": "admin" }, "createdAt": 1708345200100, "subscriberCount": 1 }
  ]
}
```

#### `what_effects`
List all active effects with their dependency chains.

```json
{
  "name": "what_effects",
  "description": "List all active effects in the running What Framework app",
  "inputSchema": {
    "type": "object",
    "properties": {
      "filter": { "type": "string", "description": "Filter by effect name (regex)" }
    }
  }
}
```

**Returns:**
```json
{
  "effects": [
    { "id": 1, "name": "renderCount", "depSignalIds": [1], "runCount": 5, "lastRunAt": 1708345210000, "stable": false },
    { "id": 2, "name": "syncLocalStorage", "depSignalIds": [2], "runCount": 1, "lastRunAt": 1708345200200, "stable": true }
  ]
}
```

#### `what_components`
List all mounted components.

```json
{
  "name": "what_components",
  "description": "List all mounted components in the running What Framework app",
  "inputSchema": {
    "type": "object",
    "properties": {
      "filter": { "type": "string", "description": "Filter by component name" }
    }
  }
}
```

**Returns:**
```json
{
  "components": [
    { "id": 1, "name": "App", "mountedAt": 1708345200000, "childCount": 3 },
    { "id": 2, "name": "Counter", "mountedAt": 1708345200050, "childCount": 0 }
  ]
}
```

#### `what_snapshot`
Full state snapshot — signals + effects + components + errors + cache.

```json
{
  "name": "what_snapshot",
  "description": "Get a complete snapshot of the running What Framework app state",
  "inputSchema": { "type": "object", "properties": {} }
}
```

#### `what_errors`
Runtime errors captured from effects and components.

```json
{
  "name": "what_errors",
  "description": "Get runtime errors from the What Framework app",
  "inputSchema": {
    "type": "object",
    "properties": {
      "since": { "type": "number", "description": "Only errors after this timestamp (ms)" },
      "limit": { "type": "number", "description": "Max errors to return", "default": 20 }
    }
  }
}
```

**Returns:**
```json
{
  "errors": [
    {
      "id": 1,
      "message": "TypeError: x.map is not a function",
      "stack": "at renderList (app.jsx:42)\n  at _runEffect (reactive.js:161)",
      "context": { "type": "effect", "name": "renderList", "effectId": 3 },
      "timestamp": 1708345215000
    }
  ]
}
```

#### `what_cache`
Inspect SWR/useQuery cache state.

```json
{
  "name": "what_cache",
  "description": "Inspect the data fetching cache (useSWR, useQuery) in the running app",
  "inputSchema": {
    "type": "object",
    "properties": {
      "key": { "type": "string", "description": "Filter by cache key" }
    }
  }
}
```

### Write Tools (Mutate State)

#### `what_set_signal`
Set a signal's value from the agent.

```json
{
  "name": "what_set_signal",
  "description": "Set a signal value in the running What Framework app (triggers reactive updates)",
  "inputSchema": {
    "type": "object",
    "properties": {
      "id": { "type": "number", "description": "Signal ID" },
      "value": { "description": "New value (JSON-serializable)" }
    },
    "required": ["id", "value"]
  }
}
```

**Returns:**
```json
{
  "previousValue": 42,
  "newValue": 100,
  "affectedEffects": [1, 3]
}
```

#### `what_invalidate_cache`
Force-refresh a cached query.

```json
{
  "name": "what_invalidate_cache",
  "description": "Invalidate a cache key, triggering refetch",
  "inputSchema": {
    "type": "object",
    "properties": {
      "key": { "type": "string", "description": "Cache key to invalidate" }
    },
    "required": ["key"]
  }
}
```

### Observe Tools (Watch Changes)

#### `what_watch`
Subscribe to signal changes. Returns a stream of updates.

```json
{
  "name": "what_watch",
  "description": "Watch for signal changes in real-time. Returns recent changes since last call.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "signalIds": { "type": "array", "items": { "type": "number" }, "description": "Signal IDs to watch (empty = all)" },
      "duration": { "type": "number", "description": "Watch for N milliseconds then return", "default": 5000 }
    }
  }
}
```

**Returns** (after duration expires):
```json
{
  "events": [
    { "type": "signal:updated", "id": 1, "name": "count", "oldValue": 42, "newValue": 43, "timestamp": 1708345220100 },
    { "type": "signal:updated", "id": 1, "name": "count", "oldValue": 43, "newValue": 44, "timestamp": 1708345220500 }
  ],
  "duration": 5000
}
```

## Package Structure

```
packages/devtools-mcp/
├── package.json
├── src/
│   ├── index.js          # MCP server (stdio) + WS server
│   ├── bridge.js         # State bridge (WS ↔ MCP state store)
│   ├── tools.js          # Tool definitions and handlers
│   └── client.js         # Browser-side WS client (injected by devtools)
└── README.md
```

### package.json
```json
{
  "name": "what-devtools-mcp",
  "version": "0.1.0",
  "description": "MCP server for live What Framework app introspection",
  "type": "module",
  "bin": {
    "what-devtools-mcp": "src/index.js"
  },
  "exports": {
    ".": "./src/index.js",
    "./client": "./src/client.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "ws": "^8.0.0"
  },
  "peerDependencies": {
    "what-devtools": ">=0.5.0"
  }
}
```

## Implementation Flow

### Phase 1: Browser → Node Bridge

**Browser side** (`client.js` — imported in app):
```javascript
import { subscribe, getSnapshot } from 'what-devtools';

export function connectDevToolsMCP(port = 9229) {
  const ws = new WebSocket(`ws://localhost:${port}`);

  ws.onopen = () => {
    // Send initial snapshot
    ws.send(JSON.stringify({ type: 'snapshot', data: getSnapshot() }));

    // Subscribe to all devtools events
    subscribe((event, data) => {
      ws.send(JSON.stringify({ type: 'event', event, data: safeSerialize(data) }));
    });
  };

  // Handle commands from agent (set signal, invalidate cache)
  ws.onmessage = (msg) => {
    const cmd = JSON.parse(msg.data);
    if (cmd.type === 'set-signal') {
      // Find signal in registry and set value
    }
    if (cmd.type === 'invalidate-cache') {
      // Call invalidateQueries
    }
  };
}
```

**Node side** (`bridge.js`):
```javascript
import { WebSocketServer } from 'ws';

export function createBridge(port = 9229) {
  const wss = new WebSocketServer({ port });
  let latestSnapshot = null;
  let eventLog = [];

  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw);
      if (msg.type === 'snapshot') latestSnapshot = msg.data;
      if (msg.type === 'event') eventLog.push({ ...msg, timestamp: Date.now() });
    });
  });

  return {
    getSnapshot: () => latestSnapshot,
    getEvents: (since) => eventLog.filter(e => e.timestamp > since),
    sendCommand: (cmd) => {
      wss.clients.forEach(ws => ws.send(JSON.stringify(cmd)));
    },
  };
}
```

### Phase 2: MCP Server

**`index.js`**:
```javascript
#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createBridge } from './bridge.js';
import { registerTools } from './tools.js';

const bridge = createBridge(9229);
const server = new Server({ name: 'what-devtools', version: '0.1.0' }, { capabilities: { tools: {} } });

registerTools(server, bridge);

const transport = new StdioServerTransport();
await server.connect(transport);
```

### Phase 3: Vite Plugin Auto-Inject

For zero-config DX, auto-inject the WS client during dev:

```javascript
// In @thenjs/build or a standalone vite plugin
export function whatDevToolsMCP() {
  return {
    name: 'what-devtools-mcp',
    transformIndexHtml(html) {
      if (process.env.NODE_ENV === 'development') {
        return html.replace('</body>',
          `<script type="module">
            import { connectDevToolsMCP } from 'what-devtools-mcp/client';
            connectDevToolsMCP();
          </script></body>`
        );
      }
      return html;
    }
  };
}
```

## How Agents Use It

### Claude Code `.mcp.json`:
```json
{
  "mcpServers": {
    "what-devtools": {
      "command": "npx",
      "args": ["what-devtools-mcp"]
    }
  }
}
```

### Agent Debugging Session:

```
Agent: "The counter isn't incrementing. Let me check."

→ calls what_signals { filter: "count" }
← { signals: [{ id: 1, name: "count", value: 0, subscriberCount: 2 }] }

Agent: "Signal exists with value 0 and 2 subscribers. Let me watch it while clicking."

→ calls what_watch { signalIds: [1], duration: 5000 }
← { events: [] }   // No changes detected in 5 seconds

Agent: "The signal never updates. Let me check the effects."

→ calls what_effects { filter: "count" }
← { effects: [{ id: 3, name: "incrementHandler", depSignalIds: [], runCount: 0 }] }

Agent: "The increment handler has 0 runs and no signal dependencies.
        The onclick handler isn't calling count(). Let me check the code..."

→ reads app.jsx, finds onclick={() => count + 1} instead of count(c => c + 1)
→ fixes the bug
```

## What This Unlocks

| Without DevTools MCP | With DevTools MCP |
|---------------------|-------------------|
| Agent reads code + guesses | Agent sees live state |
| Takes screenshot → "looks wrong" | Gets structured data: `count = 0` |
| "Add console.log and try again" | Watches signal changes in real-time |
| Can't test state changes | Sets signals directly: `what_set_signal { id: 1, value: 100 }` |
| Misses runtime errors | Gets errors with full context |
| Slow iteration cycles | Instant feedback loop |

## Implementation Priority

1. **Bridge + Basic Tools** (4h) — `what_signals`, `what_effects`, `what_snapshot`
2. **Error Capture** (1h) — Hook into effect error handlers, expose `what_errors`
3. **Watch Tool** (2h) — Real-time signal monitoring
4. **Mutation Tools** (2h) — `what_set_signal`, `what_invalidate_cache`
5. **Vite Plugin** (1h) — Auto-inject WS client
6. **Cache Inspection** (1h) — `what_cache` tool

Total: ~11 hours for full implementation.

## Open Questions

1. **Port selection**: Hardcode 9229 or make configurable? (Config = more friction)
2. **Multiple apps**: Support connecting multiple browser tabs? (Probably just use latest)
3. **Security**: Should we require a token for WS connections? (Dev-only = probably fine)
4. **Serialization**: How to handle non-JSON values (DOM refs, functions)? (Use `safeSerialize` with type tags)
5. **Existing what-mcp**: Merge into one MCP server or keep separate? (Separate — docs vs runtime are different concerns)
