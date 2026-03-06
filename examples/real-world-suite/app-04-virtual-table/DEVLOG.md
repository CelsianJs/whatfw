# DEVLOG: App 04 - Virtual Table (Large Dataset Viewer)

Agent developer experience notes for building a virtualized table with What Framework.

## useEffect cleanup

`useEffect` accepts a function that optionally returns a cleanup function. The cleanup runs before the effect re-fires (when deps change) and on component unmount. This is identical to the React model:

```js
useEffect(() => {
  el.addEventListener('scroll', handleScroll, { passive: true });
  return () => {
    el.removeEventListener('scroll', handleScroll);
  };
}, []);
```

The empty deps array `[]` means it runs once after initial render. The framework schedules effects via `queueMicrotask`, so the DOM element from `useRef` is available by the time the effect fires. Cleanup is stored on the hook and called automatically - no manual tracking needed.

## useRef for the scroll container

`useRef` was essential here. The scroll container needs a stable DOM reference for:
1. Attaching the scroll event listener
2. Attaching the resize observer via `onResize`
3. Imperatively resetting `scrollTop` when search/sort changes

`useRef` works exactly like React's - it returns a `{ current: T }` object that persists across renders without triggering re-renders. The `ref={containerRef}` JSX attribute wires up the DOM element automatically.

## useComputed for derived visible rows

This is where the framework shines. `useComputed` creates a lazily-evaluated, cached derived value that automatically tracks its signal dependencies:

```js
const visibleSlice = useComputed(() => {
  const rows = processedRows(); // depends on searchQuery, sortKey, sortDirection
  const top = scrollTop();       // depends on scroll position
  const height = containerHeight(); // depends on resize observer
  // ... calculate visible window
});
```

The computed only recomputes when one of its dependencies changes. Chaining computeds works well too - `processedRows` is itself a computed that depends on `searchQuery`, `sortKey`, and `sortDirection`, and `visibleSlice` depends on `processedRows` plus `scrollTop` and `containerHeight`. The dependency graph resolves cleanly.

## Performance observations

The critical question: does the framework handle rapid signal updates from scroll events?

The scroll handler fires `scrollTop.set(el.scrollTop)` on every scroll event (with `passive: true` for smoothness). This triggers recomputation of `visibleSlice`, which in turn re-renders only the visible rows. With 10,000 rows in the dataset, only ~20-25 rows (visible count + overscan) are in the DOM at any time.

Key observations:
- **Signal updates are synchronous** - `scrollTop.set()` immediately marks dependents as dirty
- **Computed values are lazy** - `visibleSlice` only recomputes when read during render
- **No unnecessary re-renders** - only the parts of the DOM that depend on changed signals update
- The `batch()` call in the sort handler prevents multiple intermediate re-renders when changing both `sortKey` and `sortDirection` at once

The approach works well for this use case. The framework's fine-grained reactivity means we avoid the "entire component re-render" problem that would require `React.memo` or `useMemo` in React.

## onResize helper

`onResize(element, callback)` is a framework-provided utility that wraps `ResizeObserver`. It:
- Uses a shared `ResizeObserver` instance (batched)
- Schedules callbacks through the framework's read scheduler (`scheduleRead`)
- Returns a dispose function for cleanup

Usage was straightforward:

```js
useEffect(() => {
  const dispose = onResize(el, (rect) => {
    containerHeight.set(rect.height);
  });
  return dispose;
}, []);
```

The dispose function returned by `onResize` plugs directly into `useEffect`'s cleanup return. Clean pattern.

## useSignal vs signal at module level

The data generation (`ALL_ROWS`) lives at module level as a plain constant - it never changes, so it does not need to be reactive. Using `signal()` at module level would work but is unnecessary overhead.

Inside the component, `useSignal` is the right choice for mutable state (scroll position, search query, sort config). The distinction is clear:
- **Module-level `signal()`**: for shared/global reactive state that lives outside components
- **`useSignal()` inside components**: for component-scoped reactive state tied to the component lifecycle

There was no ambiguity here. Static data stays plain, reactive UI state uses `useSignal`.

## Did the scrolling approach feel natural with signals?

Yes. The signal-based approach maps well to virtualization:

1. `scrollTop` signal = single source of truth for scroll state
2. `useComputed` for the visible window = automatic recalculation, no manual cache invalidation
3. `useEffect` for event wiring = clean lifecycle management

The one thing to watch: avoid putting expensive work inside the computed that runs on every scroll tick. The filter and sort in `processedRows` are decoupled from `scrollTop` (they depend on `searchQuery`, `sortKey`, `sortDirection`), so filtering 10k rows only happens when the user types or clicks a header - not on every scroll frame. The `visibleSlice` computed that does run on scroll is cheap (just a slice operation).

This separation emerged naturally from the signal dependency graph. The framework makes it easy to keep expensive and cheap computations in separate computed nodes.
