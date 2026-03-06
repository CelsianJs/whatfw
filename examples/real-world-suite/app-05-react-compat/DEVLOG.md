# DEVLOG: App 05 - React Compat Shopping Cart

Agent developer experience notes for building a What Framework app with `what-react` and `zustand`.

## How `reactCompat()` vite plugin works

The `reactCompat()` plugin from `what-react/vite` replaces the normal `what()` plugin from `what-compiler/vite`. It does two things:

1. **Aliases all React imports** (`react`, `react-dom`, `react/jsx-runtime`, `use-sync-external-store/*`) to their `what-react` equivalents. This means any third-party React package that does `import { useState } from 'react'` silently gets What's hook implementation instead.

2. **Configures JSX** via esbuild's `jsx: 'automatic'` with `jsxImportSource: 'react'` — which, thanks to the alias, resolves to `what-react/jsx-runtime`. So JSX compiles to `what-react`'s `createElement` calls.

3. **Excludes known React ecosystem packages** (zustand, react-redux, etc.) from Vite's `optimizeDeps` pre-bundling to avoid dual-module issues where pre-bundled code bakes in real React references.

You do NOT use both `what()` and `reactCompat()` together — `reactCompat()` is the sole plugin.

## Did zustand "just work"?

Yes. Zustand v5 uses `useSyncExternalStore` under the hood, which `what-react` implements by bridging to What's `useState` and `useEffect`. The `reactCompat()` plugin aliases `use-sync-external-store/shim/*` paths as well, so zustand's internal imports resolve correctly without any manual configuration.

The `create()` function from zustand returns a hook (`useCartStore`) that can be called with a selector, exactly like in a normal React app. No adjustments were needed.

## Mixing `useSignal` (What native) with zustand's hooks

This is the core pattern of the app:

- **What native signals** (`useSignal`, `useComputed` from `what-framework`) are used for local UI state: the search filter text, the cart open/closed toggle, and a per-card "just added" flash animation flag.
- **Zustand store** (`useCartStore` with selectors) is used for shared application state: cart items, quantities, totals.

Both can coexist in the same component. For example, `ProductCard` uses `useSignal` for a local `justAdded` flag and `useCartStore((s) => s.addItem)` to get the zustand action. They trigger re-renders through different mechanisms (signal subscription vs. `useSyncExternalStore`), but the What reconciler handles both.

The mental model: use signals for component-local reactive state, use zustand for cross-component shared state. It maps cleanly.

## Import confusion: which imports come from where?

This is the one area that requires care:

- `what-framework` exports: `mount`, `useSignal`, `useComputed`, `h`, `Fragment`, etc.
- `what-react` exports: `useState`, `useEffect`, `useSyncExternalStore`, `createElement`, etc. (React-compatible API)
- `zustand` exports: `create` (which internally uses React hooks via the alias)

You do NOT import React hooks from `what-react` directly in your app code — the JSX transform handles `createElement` automatically, and zustand calls `useSyncExternalStore` internally. Your app code imports from `what-framework` for native What APIs and from `zustand` for the store. The compat layer is invisible at the application level.

If you accidentally imported `useState` from `what-react` in a What component, it would work (it's the same function), but it's cleaner to stick with `useSignal` for local state since that's the What-native idiom.

## Was the compat layer transparent or leaky?

Mostly transparent. The plugin handles the aliasing, and zustand worked out of the box. A few observations:

- **Event handlers**: With `reactCompat()`, the JSX compiles through `what-react/jsx-runtime` which calls `what-react`'s `createElement`. This normalizes `className` to `class` for DOM elements. Event handlers like `onClick` and `onInput` work the same as in standard What components — they're camelCase, matching React convention. No `onclick` vs `onClick` confusion because the compat layer inherits What's event handling which already supports camelCase.

- **No `ReactDOM.render`**: The app uses `mount()` from `what-framework`, not `ReactDOM.createRoot`. This is intentional — `what-react` provides a `react-dom` alias but `mount()` is the canonical entry point.

## Event handling: onClick vs onclick

With `reactCompat()` active, use `onClick` (camelCase), same as both React and standard What Framework convention. The JSX transform produces `h()` calls that What's reconciler processes, and it handles camelCase event props natively. No gotcha here — it just works.

## How zustand's `create` maps to `useSyncExternalStore`

Zustand v5's `create()` returns a hook that internally:
1. Calls `useSyncExternalStore(store.subscribe, () => selector(store.getState()))`.
2. The `what-react` compat layer implements `useSyncExternalStore` by wrapping What's `useState` + `useEffect` — it subscribes to the external store and calls `setState` when the snapshot changes.

This means zustand store updates flow through What's signal-based re-render pipeline. The selector pattern (e.g., `useCartStore((s) => s.items)`) works correctly because `useSyncExternalStore` compares snapshots with `Object.is`.

## Overall feel

It felt like **writing a What Framework app that happens to use a React library**. The day-to-day authoring uses What idioms (`useSignal`, `useComputed`, `mount`), while zustand slots in as a "React-compatible" dependency that works transparently through the compat layer.

The biggest win is not having to choose: you get What's fine-grained signals for local reactivity AND access to the entire React ecosystem for shared state, UI libraries, etc. The cost is an extra dependency (`what-react`) and the knowledge that the vite plugin is doing aliasing magic under the hood.

It does not feel like writing React. It feels like writing What with superpowers.
