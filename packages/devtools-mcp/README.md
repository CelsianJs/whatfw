# what-devtools-mcp

MCP server that bridges AI agents to live What Framework app state via WebSocket.

## Architecture

```
Browser (What App + devtools)  ──WebSocket:9229──▶  Node.js Process
                                                     ├── WS Server (bridge.js)
                                                     │     └── State Store
                                                     └── MCP Server (stdio) ◀── Claude Code / Cursor
```

## Quick Start

### 1. Add the Vite plugin

```js
// vite.config.js
import whatDevToolsMCP from 'what-devtools-mcp/vite-plugin';

export default {
  plugins: [whatDevToolsMCP()],
};
```

### 2. Add to your AI tool's MCP config

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

## Available Tools

| Tool | Type | Description |
|------|------|-------------|
| `what_connection_status` | Read | Check if browser is connected |
| `what_signals` | Read | List signals with values, filter by name/ID |
| `what_effects` | Read | List effects with deps, runCount, lastRunAt |
| `what_components` | Read | List mounted components |
| `what_snapshot` | Read | Full state snapshot |
| `what_errors` | Read | Runtime errors with context |
| `what_cache` | Read | SWR/useQuery cache entries |
| `what_set_signal` | Write | Set signal value |
| `what_invalidate_cache` | Write | Force-refresh a cache key |
| `what_watch` | Observe | Collect events over N ms |

## Manual Setup (without Vite plugin)

```js
import { installDevTools } from 'what-devtools';
import { connectDevToolsMCP } from 'what-devtools-mcp/client';

installDevTools();
connectDevToolsMCP({ port: 9229 });
```

## Configuration

- `WHAT_MCP_PORT` env var — WebSocket port (default: 9229)
- Vite plugin accepts `{ port }` option
