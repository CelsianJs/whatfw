#!/usr/bin/env node
/**
 * what-devtools-mcp — MCP server entry point.
 * Creates WS bridge, registers tools + resources, connects MCP stdio transport.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createBridge } from './bridge.js';
import { registerTools } from './tools.js';

const port = parseInt(process.env.WHAT_MCP_PORT || '9229', 10);

const bridge = createBridge({ port });

const server = new McpServer({
  name: 'what-devtools-mcp',
  version: '0.2.0',
});

registerTools(server, bridge);

// --- MCP Resources: static docs for agent context ---

server.resource(
  'reactivity-model',
  'what://docs/reactivity-model',
  { description: 'How What Framework reactivity works — signals, effects, computed, batch' },
  async () => ({
    contents: [{
      uri: 'what://docs/reactivity-model',
      mimeType: 'text/markdown',
      text: `# What Framework Reactivity Model

## Signals
A signal is a reactive value. Read with \`sig()\`, write with \`sig(newValue)\` or \`sig(prev => next)\`.
Signals track which effects read them and notify those effects when they change.

\`\`\`js
const count = signal(0, 'count');  // second arg is optional debug name
count()       // read (returns 0)
count(5)      // write (sets to 5, notifies subscribers)
count.peek()  // read without tracking (no effect subscription)
\`\`\`

## Effects
An effect runs a function and auto-tracks which signals it reads. When any tracked signal changes, the effect re-runs.

\`\`\`js
effect(() => {
  console.log('Count is:', count());  // auto-tracks count
});
\`\`\`

Effects flush asynchronously via microtask, NOT synchronously.

## Computed
Derived signal. Lazy — only recomputes when deps change AND it's read.

\`\`\`js
const doubled = computed(() => count() * 2);
\`\`\`

## Batch
Group signal writes; effects run once at the end.

\`\`\`js
batch(() => {
  name('Alice');
  age(30);
  // effects that read name or age run once after batch, not twice
});
\`\`\`

## Common Bugs
- **Signal read in event handler**: Event handlers are wrapped in untrack(). Reading a signal in onclick doesn't create a subscription.
- **Effect writes to signal it reads**: Creates an infinite loop. Use untrack() to read without subscribing.
- **Stale closure**: Effect function captures old value. Read the signal inside the effect, not outside.
`,
    }],
  })
);

server.resource(
  'debugging-guide',
  'what://docs/debugging-guide',
  { description: 'How to debug What Framework apps using the MCP devtools' },
  async () => ({
    contents: [{
      uri: 'what://docs/debugging-guide',
      mimeType: 'text/markdown',
      text: `# Debugging What Framework Apps

## Step 1: Check connection
Call \`what_connection_status\` to verify the app is connected.

## Step 2: Get the lay of the land
Call \`what_diagnose\` for a comprehensive health check, or \`what_snapshot\` for raw data.

## Step 3: Investigate specific issues

### "UI isn't updating"
1. \`what_signals { filter: "relevant_name" }\` — is the signal value what you expect?
2. \`what_watch { duration: 5000 }\` — ask user to trigger the action. Do signal:updated events appear?
3. If no updates: the event handler isn't calling sig(newValue). Check the source code.
4. If updates appear but UI doesn't change: the component isn't reading the signal reactively. Check for stale closures or peek() usage.

### "Infinite re-render / effect loop"
1. \`what_effects { minRunCount: 50 }\` — find effects with high run counts
2. \`what_dependency_graph { effectId: N }\` — see what signals this effect reads and writes
3. If an effect reads and writes the same signal: use untrack() for the read

### "Slow performance"
1. \`what_diagnose { focus: "performance" }\` — identify hot effects
2. \`what_effects { minRunCount: 20 }\` — find frequently-running effects
3. Consider using batch() to group signal writes

### "Component shows wrong data"
1. \`what_component_tree\` — verify component hierarchy
2. \`what_dom_inspect { componentId: N }\` — see actual rendered output
3. \`what_signals\` — check if signal values are correct

### "Route not working"
1. \`what_route\` — check current path, params, matched pattern
2. \`what_navigate { path: "/expected" }\` — test navigation programmatically
`,
    }],
  })
);

server.resource(
  'api-reference',
  'what://docs/api-reference',
  { description: 'Quick reference for What Framework core APIs' },
  async () => ({
    contents: [{
      uri: 'what://docs/api-reference',
      mimeType: 'text/markdown',
      text: `# What Framework API Reference

## Reactive Primitives
- \`signal(initial, debugName?)\` — create reactive value
- \`computed(fn)\` — derived value (lazy)
- \`memo(fn)\` — derived value (eager, deduped)
- \`effect(fn)\` — side effect, auto-tracks deps. Returns dispose function.
- \`batch(fn)\` — group writes, effects run once after
- \`untrack(fn)\` — read signals without subscribing
- \`flushSync()\` — force pending effects to run synchronously

## Component Hooks
- \`useSignal(initial)\` — signal scoped to component
- \`useEffect(fn, deps?)\` — effect with optional dep array
- \`useRef(initial)\` — mutable ref that persists across renders
- \`useMemo(fn, deps)\` — memoized value
- \`useCallback(fn, deps)\` — memoized callback
- \`useContext(Context)\` — read context value

## Data Fetching
- \`useSWR(key, fetcher)\` — returns { data(), isLoading(), error() } as signal getters
- Key must be a string (used as Map key)

## DOM
- \`mount(vnode, selector)\` — mount app to DOM
- \`h(tag, props, ...children)\` — create virtual node
- Event handlers: lowercase (\`onclick\`, \`oninput\`, NOT camelCase in raw h() calls)
- JSX: camelCase works (\`onClick\`) — compiler transforms to lowercase

## Stores
- \`createStore(initialState)\` — returns { state, set, derived }
- \`derived(state => value)\` — derive from store state
`,
    }],
  })
);

// Import and register extended tools if available
try {
  const { registerExtendedTools } = await import('./tools-extended.js');
  registerExtendedTools(server, bridge);
} catch {
  // Extended tools not yet available — that's fine
}

const transport = new StdioServerTransport();
await server.connect(transport);
