# what-devtools-mcp: Consolidated Implementation Plan

**Date:** 2026-02-20
**Source:** Three expert reviews (Senior React Ecosystem Dev, Mid-Level React Dev, Agentic AI/MCP Expert)
**Scope:** what-devtools-mcp v0.1 bug fixes through v0.3 roadmap

---

## Part 1: Bug Fixes (Ship-Blocking)

### 1.1 `__DEV__` is always true in production

**Priority:** P0 | **Effort:** S (30 min) | **Reviewer:** R1

The `__DEV__` flag in `packages/core/src/reactive.js` line 5 is:

```js
export const __DEV__ = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production' || true;
```

The `|| true` at the end makes this unconditionally `true`. Operator precedence: `(A && B) || true` is always `true`. Every `if (__DEV__)` guard is meaningless. Devtools hooks fire in production. Dead-code elimination by bundlers (Terser, esbuild) cannot strip these paths because the expression is always truthy.

**Spec:**

Replace the entire line with:

```js
export const __DEV__ = typeof process !== 'undefined'
  ? process.env?.NODE_ENV !== 'production'
  : true;
```

Semantics: `true` when `process` is undefined (browser without bundler), `true` when NODE_ENV is not `'production'`, `false` only when NODE_ENV is `'production'`. Bundlers that define `process.env.NODE_ENV` at build time will inline `false` and tree-shake the guarded blocks.

**Verification:** After the fix, build the demo app with `NODE_ENV=production` and confirm `__DEV__` resolves to `false`. Search the production bundle for `onSignalCreate` -- it should be absent.

---

### 1.2 Subscription leak on WebSocket reconnection

**Priority:** P0 | **Effort:** S (1 hour) | **Reviewer:** R1

In `packages/devtools-mcp/src/client.js`, line 75, `devtools.subscribe()` is called on every `ws.onopen` but the returned unsubscribe function is discarded. After N reconnections, there are N active subscriptions. Every devtools event triggers N WebSocket sends.

**Spec:**

Add a module-scoped `unsubscribe` variable. Before subscribing, call the previous unsubscribe if it exists:

```js
// At the top of connectDevToolsMCP(), alongside the other let declarations:
let unsubscribeFn = null;

// Inside ws.onopen, before subscribing:
if (unsubscribeFn) {
  unsubscribeFn();
  unsubscribeFn = null;
}

// Subscribe and store the cleanup:
if (devtools) {
  unsubscribeFn = devtools.subscribe((event, data) => {
    eventCount++;
    send({ type: 'event', event, data: devtools.safeSerialize(data) });
  });
  log('MCP', BADGE, 'Subscribed to reactive events — streaming to bridge');
}
```

Also call `unsubscribeFn()` inside the `disconnect()` function for clean shutdown.

---

### 1.3 O(n*m) effect dependency resolution

**Priority:** P0 | **Effort:** M (2-3 hours) | **Reviewer:** R1

In `packages/devtools/src/index.js`, `trackEffectRun()` (line 189-212) resolves each effect's deps to signal IDs by iterating ALL signals for EACH dependency subscriber set. For an app with 200 signals and an effect with 5 deps, that is 1000 comparisons per effect run. This runs on every single effect execution.

**Spec:**

Add a reverse lookup `WeakMap` from subscriber set to signal ID. Populate it at signal registration time.

```js
// Module-scoped:
const subsToSignalId = new WeakMap();

// In registerSignal(), after assigning sig._devId:
if (sig._subs) {
  subsToSignalId.set(sig._subs, id);
}

// Replace the inner loop in trackEffectRun():
function trackEffectRun(e) {
  const id = e._devId;
  if (id == null) return;
  const entry = effects.get(id);
  if (!entry) return;

  const depSignalIds = [];
  if (e.deps) {
    for (const subSet of e.deps) {
      const sigId = subsToSignalId.get(subSet);
      if (sigId != null) depSignalIds.push(sigId);
    }
  }

  entry.depSignalIds = depSignalIds;
  entry.runCount = (entry.runCount || 0) + 1;
  entry.lastRunAt = Date.now();
  emit('effect:run', { id, depSignalIds: entry.depSignalIds, runCount: entry.runCount });
}
```

Complexity drops from O(n*m) to O(m) where m is the number of deps per effect. The WeakMap is garbage-collected when signals are disposed.

---

### 1.4 Production guard on `connectDevToolsMCP()`

**Priority:** P0 | **Effort:** S (15 min) | **Reviewer:** R1

The browser-side client has no guard against running in production. If a developer ships their app with the Vite plugin still configured, the client will attempt WebSocket connections in production.

**Spec:**

Add an early return at the top of `connectDevToolsMCP()` in `client.js`:

```js
export function connectDevToolsMCP({ port = 9229 } = {}) {
  // Never connect in production
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') return { disconnect() {}, isConnected: false, eventCount: 0 };
  // Belt-and-suspenders: check import.meta.env (Vite)
  if (typeof import.meta !== 'undefined' && import.meta.env?.PROD) return { disconnect() {}, isConnected: false, eventCount: 0 };
  // ...existing code
}
```

The Vite plugin already has `apply: 'serve'` which prevents injection during `vite build`, but the manual setup path (`import { connectDevToolsMCP }`) has no such guard.

---

## Part 2: Tool Quality Improvements (High-Impact, Lower Effort)

### 2.1 Add `filter` param to `what_effects`

**Priority:** P1 | **Effort:** S (30 min) | **Reviewers:** R2, R3

`what_signals` has a `filter` regex param. `what_effects` only has `minRunCount`. Add consistent filtering.

**Spec:**

Add to `what_effects` schema:

```js
filter: z.string().optional().describe('Regex pattern to filter effect names'),
```

In the handler, after the `minRunCount` filter:

```js
if (filter) {
  try {
    const re = new RegExp(filter, 'i');
    effects = effects.filter(e => re.test(e.name));
  } catch {
    return error(`Invalid regex: ${filter}`);
  }
}
```

---

### 2.2 Add `filter` param to `what_components`

**Priority:** P1 | **Effort:** S (30 min) | **Reviewers:** R2, R3

`what_components` currently takes zero params. Add a filter.

**Spec:**

Change the schema from `{}` to:

```js
{
  filter: z.string().optional().describe('Regex pattern to filter component names'),
}
```

Add handler logic matching the `what_signals` pattern.

---

### 2.3 Add `key` filter to `what_cache`

**Priority:** P1 | **Effort:** S (30 min) | **Reviewer:** R3

DESIGN.md specifies a `key` filter but the implementation doesn't have one.

**Spec:**

Add to schema:

```js
{
  key: z.string().optional().describe('Filter cache entries by key (substring match)'),
}
```

Filter the result array by `entry.key.includes(key)`.

---

### 2.4 Enrich tool outputs with summary fields and signal name resolution

**Priority:** P1 | **Effort:** M (3-4 hours) | **Reviewer:** R3

This is the single highest-impact quality improvement. Currently, tool outputs are raw data dumps. An agent receives `depSignalIds: [1, 3, 7]` but has no idea what those signals are without a second call. Every tool response should include a human/agent-readable summary.

**Spec:**

For `what_effects`, resolve signal IDs to names inline:

```json
{
  "count": 2,
  "effects": [
    {
      "id": 1,
      "name": "renderCount",
      "depSignalIds": [1, 3],
      "depSignalNames": ["count", "user.name"],
      "runCount": 5,
      "lastRunAt": 1708345210000
    }
  ],
  "summary": "2 effects tracked. 1 has run 5+ times (renderCount) - may indicate a hot path."
}
```

Implementation: Build a `signalIdToName` lookup from the snapshot's signals array. Pass it to each tool handler. Add a `summary` string to every tool response that highlights noteworthy items (high run counts, stale effects, error counts, etc.).

For `what_snapshot`, add a `summary` object at the top:

```json
{
  "summary": {
    "signals": 12,
    "effects": 8,
    "components": 5,
    "errors": 1,
    "hotEffects": ["renderList (47 runs)"],
    "staleSignals": []
  },
  "signals": [...],
  "effects": [...],
  ...
}
```

---

### 2.5 Add `nextSteps` hints to error responses and `what_errors`

**Priority:** P1 | **Effort:** S (1 hour) | **Reviewer:** R3

When `what_errors` returns errors, tell the agent what to do next. When a tool returns `noConnection`, tell the agent how to fix it.

**Spec:**

Add a `nextSteps` array to `what_errors` responses:

```json
{
  "count": 1,
  "errors": [...],
  "nextSteps": [
    "Use what_signals to check the current value of signals referenced in the error stack",
    "Use what_effects { filter: 'renderList' } to inspect the failing effect's dependencies",
    "Check the component source code at the stack trace location"
  ]
}
```

For `noConnection`, the existing `hint` field is good. Rename it to `nextSteps` for consistency and make it an array.

---

### 2.6 Enumerate valid event types in `what_watch` description

**Priority:** P1 | **Effort:** S (15 min) | **Reviewer:** R3

The `what_watch` tool description doesn't tell the agent what event names are available.

**Spec:**

Update the tool description to:

```
Watch for signal/effect changes over a time window. Collects events for the specified duration.
Event types: signal:created, signal:updated, signal:disposed, effect:created, effect:run, effect:disposed, error:captured, component:mounted, component:unmounted.
```

---

### 2.7 Document mutual exclusivity of `filter` and `id` in `what_signals`

**Priority:** P2 | **Effort:** S (15 min) | **Reviewer:** R3

The `id` and `filter` params on `what_signals` are mutually exclusive but this isn't stated.

**Spec:**

Update parameter descriptions:

```js
filter: z.string().optional().describe('Regex to filter signal names (ignored if id is set)'),
id: z.number().optional().describe('Get a specific signal by ID (takes precedence over filter)'),
```

---

### 2.8 Add truncation to `what_snapshot` for large apps

**Priority:** P1 | **Effort:** S (1 hour) | **Reviewer:** R3

An app with 500 signals will produce a massive JSON blob. MCP tool responses have practical size limits.

**Spec:**

Add a `maxSignals` param (default 100) and `maxEffects` param (default 100). When truncated, include a `truncated: true` flag and the total count:

```json
{
  "summary": { "signals": 500, "truncatedTo": 100, ... },
  "signals": [/* first 100 */],
  "truncated": true
}
```

---

### 2.9 Extract shared snapshot refresh helper

**Priority:** P2 | **Effort:** S (30 min) | **Reviewer:** R3

The pattern `try { snapshot = await bridge.refreshSnapshot(); } catch { snapshot = bridge.getSnapshot(); }` appears 5 times in `tools.js`.

**Spec:**

Add to `bridge.js`:

```js
async function getOrRefreshSnapshot() {
  try {
    return await refreshSnapshot();
  } catch {
    return latestSnapshot;
  }
}
```

Expose it and use it in all 5 tool handlers.

---

### 2.10 Snapshot deduplication / caching window

**Priority:** P2 | **Effort:** S (1 hour) | **Reviewer:** R1

Concurrent tool calls (agent calls `what_signals` and `what_effects` simultaneously) both trigger `refreshSnapshot()`, causing redundant serialization and WebSocket round-trips.

**Spec:**

Add a 100ms cache window to `getOrRefreshSnapshot()`:

```js
let cachedSnapshot = null;
let cacheTime = 0;

async function getOrRefreshSnapshot() {
  const now = Date.now();
  if (cachedSnapshot && now - cacheTime < 100) return cachedSnapshot;
  try {
    cachedSnapshot = await refreshSnapshot();
    cacheTime = now;
    return cachedSnapshot;
  } catch {
    return latestSnapshot;
  }
}
```

---

## Part 3: New Tools (Prioritized by Cross-Review Consensus)

### Tier 1: All 3 reviewers requested (ship in v0.2)

#### 3.1 `what_component_tree` -- Hierarchical component view

**Priority:** P1 | **Effort:** M (1-2 days) | **Reviewers:** R1, R2, R3

The single biggest gap. All three reviewers called this out. `what_components` returns a flat list of `{ id, name }` which is useless for understanding app structure. The data is already there: `ctx._parentCtx` exists in `dom.js` and forms a tree.

**Input Schema:**

```json
{
  "rootId": { "type": "number", "description": "Start from this component (default: full tree)" },
  "depth": { "type": "number", "description": "Max depth to traverse (default: 10)" },
  "filter": { "type": "string", "description": "Only include subtrees containing components matching this regex" }
}
```

**Expected Output:**

```json
{
  "tree": {
    "id": 1,
    "name": "App",
    "children": [
      {
        "id": 2,
        "name": "Header",
        "children": []
      },
      {
        "id": 3,
        "name": "Counter",
        "children": [],
        "signalCount": 2,
        "effectCount": 1
      }
    ]
  },
  "totalComponents": 3,
  "maxDepth": 2,
  "summary": "3 components, max depth 2. Root: App > [Header, Counter]"
}
```

**Implementation:**

1. In `what-devtools` `registerComponent()`, store the parent component ID by reading `componentStack` (already maintained in `dom.js`). Add `parentId` to the component entry.
2. In `what-devtools` `getSnapshot()`, include `parentId` on each component.
3. In `tools.js`, build the tree from the flat list using a simple `parentId` -> children grouping.
4. Also enhance existing `what_components` to include `parentId` and `signalCount` per component.

**Instrumentation change needed:** The devtools `onComponentMount` hook receives `ctx` which has `_parentCtx`. Thread `_parentCtx._devId` as `parentId` through to the component registry.

---

#### 3.2 `what_dependency_graph` -- Reactive dependency graph

**Priority:** P1 | **Effort:** M (1-2 days) | **Reviewers:** R1 (as `what_signal_graph`), R2 (as `what_signal_subscribers`), R3

The unique selling point of this entire package. No other devtools -- React, Vue, Svelte, Solid -- gives a structured reactive dependency graph that an AI agent can traverse. This is what makes What Framework's MCP devtools genuinely differentiated.

**Input Schema:**

```json
{
  "signalId": { "type": "number", "description": "Show graph starting from this signal" },
  "direction": { "type": "string", "enum": ["downstream", "upstream", "both"], "description": "downstream = who depends on this signal; upstream = what does this effect depend on; both = full graph (default: downstream)" }
}
```

**Expected Output:**

```json
{
  "graph": {
    "nodes": [
      { "type": "signal", "id": 1, "name": "count", "value": 42 },
      { "type": "effect", "id": 3, "name": "renderCount", "runCount": 5 },
      { "type": "signal", "id": 5, "name": "doubleCount", "value": 84 }
    ],
    "edges": [
      { "from": { "type": "signal", "id": 1 }, "to": { "type": "effect", "id": 3 }, "relation": "triggers" },
      { "from": { "type": "signal", "id": 1 }, "to": { "type": "signal", "id": 5 }, "relation": "derived" }
    ]
  },
  "summary": "signal 'count' (id:1) has 2 downstream dependents: effect 'renderCount', computed 'doubleCount'"
}
```

**Implementation:**

1. Effects already track `depSignalIds`. That gives us signal -> effect edges.
2. For computed signals (which are backed by effects internally), we can detect them by checking if a signal's `ref` has a corresponding internal effect.
3. Build a simple adjacency representation. Cap traversal depth at 5 to prevent massive graphs.
4. The reverse lookup (signal -> subscribers) is available from `sig._subs` in dev mode.

---

#### 3.3 `what_eval` -- Execute arbitrary JS in browser

**Priority:** P1 | **Effort:** S (3-4 hours) | **Reviewers:** R1, R2, R3

The escape hatch. When the structured tools are not enough, the agent needs to run arbitrary code in the browser context. All three reviewers requested this.

**Input Schema:**

```json
{
  "code": { "type": "string", "description": "JavaScript code to execute in the browser context. Has access to window, document, and __WHAT_DEVTOOLS__." },
  "timeout": { "type": "number", "description": "Max execution time in ms (default: 5000, max: 30000)" }
}
```

**Expected Output:**

```json
{
  "result": "/* serialized return value */",
  "type": "object",
  "executionTime": 12,
  "logs": ["console.log output captured during execution"]
}
```

**Implementation:**

1. Add an `eval` command to the browser-side `handleCommand()` in `client.js`.
2. Use `new Function(code)()` (not raw `eval`) for slightly better scoping.
3. Wrap in try/catch. Serialize the result with `safeSerialize`.
4. Capture `console.log` calls during execution by temporarily patching `console.log`.
5. Enforce timeout with `Promise.race` and `setTimeout`.
6. Add a prominent warning in the tool description: "Executes arbitrary code. The agent should explain what it intends to do before running."

**Security note:** This is a dev-only tool. The production guard from 1.4 prevents it from being available in production. The MCP server itself only runs during development.

---

#### 3.4 `what_dom_inspect` -- Component rendered output

**Priority:** P1 | **Effort:** S (3-4 hours) | **Reviewers:** R1 (as `what_dom_snapshot`), R2 (as `what_dom_output`), R3

Agents cannot see what a component rendered. They can take screenshots, but structured DOM output is far more useful for debugging layout and content issues.

**Input Schema:**

```json
{
  "componentId": { "type": "number", "description": "Component ID to inspect" },
  "depth": { "type": "number", "description": "Max DOM depth to include (default: 3)" },
  "includeStyles": { "type": "boolean", "description": "Include computed styles on elements (default: false)" }
}
```

**Expected Output:**

```json
{
  "componentName": "Counter",
  "html": "<div class=\"counter\"><span>Count: 42</span><button>+</button></div>",
  "structure": {
    "tag": "div",
    "class": "counter",
    "children": [
      { "tag": "span", "text": "Count: 42" },
      { "tag": "button", "text": "+" }
    ]
  },
  "summary": "Counter renders a div.counter with a span showing 'Count: 42' and a button"
}
```

**Implementation:**

1. Add a `dom-inspect` command to the browser client.
2. Look up the component by `_devId` in the devtools registry, get its `element` (`<what-c>` wrapper).
3. Serialize the DOM subtree to a simplified JSON structure (tag, attributes, text content, children) up to `depth` levels.
4. Also return `element.innerHTML` as raw HTML (truncated to 5000 chars).

---

### Tier 2: Two reviewers requested (ship in v0.2-v0.3)

#### 3.5 `what_route` -- Current route info

**Priority:** P1 | **Effort:** S (2-3 hours) | **Reviewer:** R3

Every debug session starts with "what page am I on?" The router is a core package (`packages/router`).

**Input Schema:**

```json
{}
```

**Expected Output:**

```json
{
  "path": "/dashboard/settings",
  "params": { "tab": "general" },
  "query": { "debug": "true" },
  "matchedRoute": "/dashboard/:tab",
  "componentName": "SettingsPage",
  "summary": "Currently on /dashboard/settings (route: /dashboard/:tab, component: SettingsPage)"
}
```

**Implementation:**

1. Add a `get-route` command to the browser client.
2. Read from `window.__WHAT_CORE__` router state, or fall back to `window.location`.
3. If the What router is active, include the matched route pattern and component.

---

#### 3.6 `what_performance` -- Effect execution timing

**Priority:** P2 | **Effort:** M (1-2 days) | **Reviewers:** R1, R2

Effect timing data helps identify performance bottlenecks.

**Input Schema:**

```json
{
  "threshold": { "type": "number", "description": "Only show effects slower than this (ms, default: 1)" },
  "sort": { "type": "string", "enum": ["totalTime", "avgTime", "runCount"], "description": "Sort order (default: totalTime)" }
}
```

**Expected Output:**

```json
{
  "effects": [
    {
      "id": 3,
      "name": "renderList",
      "runCount": 47,
      "totalTime": 234.5,
      "avgTime": 4.99,
      "maxTime": 12.3,
      "lastRunAt": 1708345210000
    }
  ],
  "summary": "1 effect above 1ms threshold. renderList: 47 runs, 234ms total, 5ms avg."
}
```

**Implementation:**

1. Add `performance.now()` timing in `trackEffectRun()` in devtools. Store `totalTime`, `maxTime` per effect.
2. This requires instrumenting the `onEffectRun` hook to include timing data, which means wrapping the effect execution in the reactive system's `_runEffect` with timing markers.
3. Simpler alternative: Add `performance.mark`/`performance.measure` calls and read from the Performance API.

---

#### 3.7 `what_diagnose` -- Multi-check diagnostic tool

**Priority:** P2 | **Effort:** M (1-2 days) | **Reviewer:** R3

A single tool that runs multiple checks and returns a structured diagnosis. Reduces the 3-5 tool call sequence that most debug sessions require down to 1.

**Input Schema:**

```json
{
  "focus": { "type": "string", "enum": ["errors", "performance", "reactivity", "all"], "description": "What to focus the diagnosis on (default: all)" }
}
```

**Expected Output:**

```json
{
  "status": "issues_found",
  "issues": [
    { "severity": "error", "category": "runtime", "message": "TypeError in effect 'renderList'", "suggestion": "Check signal value types" },
    { "severity": "warning", "category": "performance", "message": "Effect 'syncAll' has run 200+ times", "suggestion": "Consider using batch() or untrack()" }
  ],
  "healthy": [
    "All 12 signals have active subscribers",
    "No stale cache entries",
    "Component tree depth is 4 (healthy)"
  ],
  "summary": "1 error, 1 warning. App has 12 signals, 8 effects, 5 components."
}
```

---

#### 3.8 `what_navigate` -- Programmatic route change

**Priority:** P2 | **Effort:** S (2 hours) | **Reviewer:** R3

Let the agent navigate to a different route for testing.

**Input Schema:**

```json
{
  "path": { "type": "string", "description": "Path to navigate to (e.g. '/dashboard')" },
  "replace": { "type": "boolean", "description": "Use replaceState instead of pushState (default: false)" }
}
```

**Implementation:** Send a command to the browser client that calls the What router's `navigate()` function, or falls back to `history.pushState()`.

---

#### 3.9 `what_diff_snapshot` -- Compare before/after snapshots

**Priority:** P2 | **Effort:** M (1 day) | **Reviewer:** R3

Lets the agent take a snapshot, perform an action, then diff the two states.

**Input Schema:**

```json
{
  "action": { "type": "string", "enum": ["save", "diff"], "description": "save = store current state as baseline; diff = compare current state to baseline" }
}
```

**Expected Output (diff mode):**

```json
{
  "signalsChanged": [
    { "id": 1, "name": "count", "before": 0, "after": 5 }
  ],
  "signalsAdded": [],
  "signalsRemoved": [],
  "effectsTriggered": [
    { "id": 3, "name": "renderCount", "runsBefore": 1, "runsAfter": 6 }
  ],
  "errorsNew": [],
  "summary": "1 signal changed (count: 0 -> 5), 1 effect triggered 5 additional times"
}
```

**Implementation:** Store a baseline snapshot in the bridge's state. On `diff`, take a fresh snapshot and compute the delta.

---

### Tier 3: Single reviewer requested (ship in v0.3 or later)

#### 3.10 `what_highlight` -- Visual component highlight

**Priority:** P3 | **Effort:** S (2 hours) | **Reviewer:** R1

Send a command to the browser that adds a colored overlay on a component's DOM element. Useful for confirming which component the agent is looking at.

---

#### 3.11 `what_dispatch_event` -- Simulate user interactions

**Priority:** P3 | **Effort:** M (1 day) | **Reviewer:** R3

Simulate click, input, keypress events on elements. Partially overlaps with `what_eval` (which can do `document.querySelector('.btn').click()`). Defer until `what_eval` proves insufficient.

---

## Part 4: DX & Onboarding

### 4.1 Rewrite README with onboarding focus

**Priority:** P1 | **Effort:** M (2-3 hours) | **Reviewer:** R2

The current README assumes the reader knows what MCP is and where config files go. A mid-level developer with React experience does not.

**Spec -- README structure:**

```markdown
# what-devtools-mcp

AI-powered debugging for What Framework apps. Lets Claude Code, Cursor,
and other AI agents inspect your app's live state -- signals, effects,
components, errors -- in real time.

> **What is MCP?** Model Context Protocol is an open standard that lets
> AI tools call functions in external systems. This package exposes your
> app's runtime state as MCP tools that your AI coding assistant can call.

## Install

npm install --save-dev what-devtools-mcp

## Setup

### Step 1: Vite Plugin (auto-injects the bridge client)
[code block]

### Step 2: AI Tool Configuration

**Claude Code** -- add to `.claude/mcp.json` in your project root:
[code block + note about file location]

**Cursor** -- add to `.cursor/mcp.json`:
[code block]

**Other MCP clients** -- any client that supports stdio transport:
[code block]

### Step 3: Start your app
[command, then "You should see: [screenshot of console output]"]

## What Can Your AI Do Now?
[Move the debugging walkthrough from DESIGN.md lines 437-457 here]

## Available Tools
[Existing table, enhanced with one-line examples]

## Troubleshooting
- "No browser connected" -- your app isn't running or the Vite plugin isn't configured
- "No snapshot available" -- the page loaded but devtools haven't initialized; refresh the page
- WebSocket connection refused -- check that port 9229 isn't in use (`lsof -i :9229`)
- Multiple tabs -- only the latest tab's state is tracked

## Manual Setup (without Vite)
[Existing section]
```

---

### 4.2 Ship `.claude/mcp.json` in `create-what` scaffolds

**Priority:** P1 | **Effort:** S (30 min) | **Reviewer:** R3

When a user runs `npx create-what my-app`, the scaffold should include a pre-configured MCP config so devtools work immediately.

**Spec:**

Add to the `create-what` template at `.claude/mcp.json`:

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

Also add to `.cursor/mcp.json` with the same content.

---

### 4.3 Wire MCP bridge auto-start into `what dev` CLI

**Priority:** P2 | **Effort:** M (3-4 hours) | **Reviewer:** R3

When a developer runs `what dev` (the CLI dev server), automatically start the MCP bridge server alongside Vite. No separate terminal process needed.

**Spec:**

In the CLI's `dev` command handler, detect if `what-devtools-mcp` is installed. If so, spawn the MCP bridge as a child process (or import and start it in-process). Print:

```
  what dev server running at http://localhost:3000
  MCP bridge listening on ws://localhost:9229
```

This should be opt-out via `--no-mcp` flag, not opt-in.

---

### 4.4 Add MCP resources for agent context

**Priority:** P2 | **Effort:** M (3-4 hours) | **Reviewer:** R3

MCP supports "resources" -- static documents the agent can read for context. Ship resources that explain What Framework's reactivity model, common patterns, and debugging strategies.

**Spec:**

Register 2-3 MCP resources in `index.js`:

1. `what://docs/reactivity-model` -- How signals, effects, computed, batch work. 1-page summary.
2. `what://docs/debugging-guide` -- Common issues and how to use the tools to diagnose them.
3. `what://docs/api-reference` -- Quick reference for signal(), effect(), computed(), etc.

These are cheap to implement (static text strings) and significantly improve agent effectiveness by giving it framework-specific knowledge without requiring it to read source files.

---

## Part 5: Architecture Improvements

### 5.1 Event batching / throttling

**Priority:** P1 | **Effort:** M (3-4 hours) | **Reviewer:** R1

A signal updating at 60fps generates 60 WebSocket messages per second. This floods the bridge's event log and wastes bandwidth.

**Spec:**

Add a 16ms (one frame) batching window in the browser client's event subscription:

```js
let eventBatch = [];
let batchTimer = null;

function flushEvents() {
  if (eventBatch.length === 0) return;
  send({ type: 'events', batch: eventBatch });
  eventBatch = [];
  batchTimer = null;
}

devtools.subscribe((event, data) => {
  eventCount++;
  eventBatch.push({ event, data: devtools.safeSerialize(data) });
  if (!batchTimer) {
    batchTimer = setTimeout(flushEvents, 16);
  }
});
```

On the bridge side, handle the `events` message type by unpacking the batch into individual log entries.

---

### 5.2 Signal debug names

**Priority:** P1 | **Effort:** L (3-5 days total: core change + compiler transform) | **Reviewer:** R1

Every signal shows as `signal_1`, `signal_2` because `signal()` doesn't accept a name parameter. This is the biggest usability gap for devtools.

**Spec -- Phase 1 (manual, ship now):**

Add an optional second parameter to `signal()`:

```js
export function signal(initial, name) {
  // ...existing code...
  if (__DEV__ && name) sig._debugName = name;
  if (__DEV__ && __devtools) __devtools.onSignalCreate(sig);
  return sig;
}
```

In `what-devtools` `registerSignal()`, prefer `sig._debugName` over the auto-generated name:

```js
name: sig._debugName || name || `signal_${id}`,
```

**Spec -- Phase 2 (compiler transform, ship later):**

Add a compiler/babel transform that reads the variable name at the call site:

```js
// Input:
const count = signal(0);
// Output:
const count = signal(0, 'count');
```

This is a standard pattern (React's `displayName`, Solid's signal names). The transform is ~50 lines. Add it to `packages/compiler`.

---

### 5.3 HTTP/SSE transport option

**Priority:** P3 | **Effort:** L (3-5 days) | **Reviewer:** R3

For remote debugging (app running on a phone, CI, deployed preview), WebSocket localhost doesn't work. Add an HTTP/SSE transport as an alternative.

**Spec:** Defer to v0.3. The current WebSocket transport is correct for local development. When remote debugging becomes a real user request, implement an HTTP polling + SSE push transport behind the same bridge interface.

---

### 5.4 WebMCP readiness

**Priority:** P2 | **Effort:** M (architecture only, no code) | **Reviewer:** R3

WebMCP (browser-native MCP) would eliminate the WebSocket bridge entirely. The tool handlers would run directly in the browser.

**Spec:**

Refactor tool handlers in `tools.js` to be transport-agnostic. Currently they call `bridge.refreshSnapshot()` and `bridge.sendCommand()`. Extract the core logic so each tool is a pure function:

```js
// Pure tool handler -- no bridge dependency
function handleSignals({ filter, id }, snapshot) {
  let signals = snapshot.signals || [];
  if (id != null) signals = signals.filter(s => s.id === id);
  // ...
  return { count: signals.length, signals };
}
```

The bridge-based MCP server wraps these with snapshot fetching. A future WebMCP server wraps them with direct devtools access. Same handlers, different plumbing.

Do NOT build WebMCP now. Just keep the architecture clean so it is possible later without rewriting tool logic.

---

## Part 6: Chrome Extension Decision

### Synthesis

All three reviewers agree: **do not build a Chrome extension for v1.** The reasoning converges:

- **R1:** "Not yet. MCP is the unique differentiator. Chrome extension is 200+ hours and table-stakes."
- **R2:** "Yes I want one, but as a companion, not a replacement."
- **R3:** "Not needed for v1. Build it as an MCP client that connects to the same server."

### Recommendation

**Do not build a Chrome extension until after the MCP devtools have real users (target: 50+ weekly active developers).** Here is why:

1. **Effort asymmetry.** The MCP server is ~500 lines and provides a genuinely novel capability. A Chrome extension is 200+ hours of work for something that every framework already has (React DevTools, Vue DevTools, Svelte DevTools). It would be table-stakes, not a differentiator.

2. **Sequencing.** The Chrome extension should be built on top of the same instrumentation layer (`what-devtools`) and ideally connect to the same MCP bridge. Building it now would create a second data path. Building it later (once the instrumentation layer is battle-tested) means it gets correctness for free.

3. **The right v2 architecture.** When the time comes, the Chrome extension should be an MCP client -- it connects to the `what-devtools-mcp` server and uses the same tools. The extension provides the visual UI (component tree, signal inspector, timeline). The MCP server provides the data. One instrumentation layer, two clients (AI agent + human developer), zero duplication.

### Timeline

| Milestone | Trigger | What to build |
|-----------|---------|---------------|
| Now (v0.1-0.2) | --- | MCP server, bug fixes, new tools from this plan |
| v0.3 | 50+ weekly active devs using MCP tools | Chrome extension spike: component tree panel + signal inspector, connecting as MCP client |
| v0.4+ | User feedback from extension spike | Full Chrome extension with timeline, performance tab, network overlay |

---

## Implementation Order

This is the recommended sequence, optimized for shipping usable improvements as fast as possible.

### Week 1: Bug fixes + quick wins

| # | Item | Effort | Section |
|---|------|--------|---------|
| 1 | Fix `__DEV__ || true` | S | 1.1 |
| 2 | Fix subscription leak | S | 1.2 |
| 3 | Fix O(n*m) dep resolution | M | 1.3 |
| 4 | Add production guard | S | 1.4 |
| 5 | Add `filter` to effects | S | 2.1 |
| 6 | Add `filter` to components | S | 2.2 |
| 7 | Add `key` to cache | S | 2.3 |
| 8 | Enumerate watch events | S | 2.6 |
| 9 | Extract snapshot helper | S | 2.9 |

### Week 2: Output quality + first new tools

| # | Item | Effort | Section |
|---|------|--------|---------|
| 10 | Summary fields + signal name resolution | M | 2.4 |
| 11 | nextSteps hints | S | 2.5 |
| 12 | Snapshot truncation | S | 2.8 |
| 13 | Snapshot dedup cache | S | 2.10 |
| 14 | Event batching | M | 5.1 |
| 15 | `what_eval` | S | 3.3 |
| 16 | `what_route` | S | 3.5 |

### Week 3: Major new tools

| # | Item | Effort | Section |
|---|------|--------|---------|
| 17 | Signal debug names (Phase 1) | S | 5.2 |
| 18 | `what_component_tree` | M | 3.1 |
| 19 | `what_dependency_graph` | M | 3.2 |
| 20 | `what_dom_inspect` | S | 3.4 |
| 21 | README rewrite | M | 4.1 |

### Week 4: DX + polish

| # | Item | Effort | Section |
|---|------|--------|---------|
| 22 | `.claude/mcp.json` in create-what | S | 4.2 |
| 23 | MCP resources | M | 4.4 |
| 24 | `what_diagnose` | M | 3.7 |
| 25 | `what_diff_snapshot` | M | 3.9 |
| 26 | CLI auto-start | M | 4.3 |
| 27 | WebMCP-ready refactor | M | 5.4 |

Items 3.6 (`what_performance`), 3.8 (`what_navigate`), 3.10 (`what_highlight`), 3.11 (`what_dispatch_event`), and 5.2 Phase 2 (compiler transform for signal names) are deferred to v0.3 based on user feedback.

---

## Appendix: Reviewer Agreement Matrix

| Item | R1 | R2 | R3 | Consensus |
|------|----|----|-----|-----------|
| `__DEV__` bug | Y | | | Single reviewer, but objectively critical |
| Subscription leak | Y | | | Single reviewer, but objectively critical |
| Component tree tool | Y | Y | Y | **Unanimous** |
| Dependency graph tool | Y | Y | Y | **Unanimous** |
| `what_eval` tool | Y | Y | Y | **Unanimous** |
| DOM inspect tool | Y | Y | Y | **Unanimous** |
| Output summaries | | | Y | Single, but highest-impact quality fix |
| Performance timing | Y | Y | | Two reviewers |
| Route tool | | | Y | Single, but low effort + high utility |
| Chrome ext: not now | Y | Y* | Y | **Unanimous** (*R2 wants it eventually) |
| WebMCP prep | | | Y | Single, endorsed by project memory |
| README rewrite | | Y | | Single, but obviously needed |
| Signal debug names | Y | | | Single, but foundational for all tooling |
