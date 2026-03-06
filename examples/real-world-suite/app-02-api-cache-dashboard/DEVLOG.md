# DEVLOG: API Cache Dashboard (app-02)

Agent developer experience notes while building this example with What Framework's
data-fetching primitives.

---

## How `useSWR` works differently from React's SWR

React's `useSWR` (from `swr`) returns plain values: `{ data, error, isLoading }`.
You read them directly (`data.name`).

What Framework's `useSWR` returns **getter functions** backed by signals:
`{ data: () => ..., error: () => ..., isLoading: () => ... }`.

You must **call** them to read: `swr.data()`, `swr.error()`, `swr.isLoading()`.

This is the core mental model difference: in What, every reactive value is a
function you invoke. The framework tracks which signals are read inside the
JSX render, and only re-renders the DOM nodes that depend on changed signals.

## The `swr.data()` vs `swr.data` confusion

This is the single biggest gotcha. If you write:

```jsx
<span>{swr.data}</span>
```

You get `[Function]` rendered as text, not your data. You need:

```jsx
<span>{swr.data()}</span>
```

Similarly for error/loading checks:

```jsx
// WRONG -- this is always truthy (it's a function reference)
{swr.isLoading && <Spinner />}

// CORRECT
{swr.isLoading() && <Spinner />}
```

Once you internalize "everything is a getter", it becomes natural. But it
absolutely tripped me up on the first pass.

## Cache key patterns

`useSWR` takes a string key as its first argument. The cache is global and
keyed by this exact string. Patterns I used:

- `'dashboard:users'` -- static key for the user list
- `'dashboard:stats'` -- static key for the stats panel
- `` `user-detail:${id}` `` -- dynamic key for per-user detail

The fetcher receives the key as its first argument, which is handy for
parameterized endpoints. My `fetchUserDetail` parses the ID out of the key
string (`key.split(':')[1]`).

**Conditional fetching:** Passing `null` or `false` as the key disables the
fetch entirely -- `useSWR` returns an idle object with no network call. This
is how you do dependent/conditional fetching:

```jsx
const key = selectedId() ? `user-detail:${selectedId()}` : null;
const detail = useSWR(key, fetchUserDetail);
```

## How `invalidateQueries` works

`invalidateQueries(key)` triggers all active `useSWR` instances subscribed to
that key to re-fetch. By default it's a **soft** invalidation -- stale data
stays visible while the re-fetch runs (true SWR behavior).

Pass `{ hard: true }` to clear the cached value immediately, which triggers
the loading state to show again.

You can also pass a predicate function to invalidate multiple keys:

```js
invalidateQueries((key) => key.startsWith('dashboard:'));
```

In my app, the "Refresh All" button explicitly invalidates each key. The
predicate approach would also work but felt less explicit for a demo.

## How polling / revalidation works

`useSWR` supports `refreshInterval` in its options:

```js
useSWR('dashboard:stats', fetchStats, { refreshInterval: 5000 });
```

This sets up a `setInterval` internally via `scopedEffect`, which means it's
automatically cleaned up when the component unmounts. No manual cleanup needed.

Other automatic revalidation triggers:
- `revalidateOnFocus: true` (default) -- refetches when the tab regains focus
- `revalidateOnReconnect: true` (default) -- refetches when coming back online

The `dedupingInterval` (default 2000ms) prevents duplicate fetches when
multiple components read the same key or when rapid invalidations occur.

## Loading / error state access

Both `isLoading()` and `error()` are getter functions. Key distinction:

- `isLoading()` is true only on the **initial** load (no cached data yet)
- `isValidating()` is true whenever a fetch is in-flight (including revalidation)

So for skeleton loading states, use `isLoading()`. For a subtle "refreshing"
indicator on top of existing data, use `isValidating()`.

Error signals persist until the next successful fetch clears them. After
toggling error mode off and revalidating, the error clears automatically.

## Gotchas

1. **`useSignal` returns a signal object, not a tuple.** Unlike React's
   `useState` which returns `[value, setter]`, What's `useSignal` returns the
   signal itself. Read with `sig()`, write with `sig.set(value)`.

2. **Conditional `useSWR` with dynamic keys.** When using a dynamic key that
   depends on a signal (like `selectedId`), you need to compute the key
   outside of `useSWR` and handle the `null` case. Each unique key string
   creates a separate cache entry.

3. **Fetcher signature.** The fetcher receives `(key, { signal })` where
   `signal` is an `AbortSignal`. You should respect it to avoid updating
   state after unmount. This is well-designed -- matches modern fetch patterns.

4. **Shared cache is truly global.** Two components using `useSWR` with the
   same key share the exact same cache signal. Mutating from one updates the
   other instantly. This is powerful but means key naming discipline matters.

## Overall feel

The API felt **intuitive once you grok the signal-getter pattern**. The SWR
semantics (stale-while-revalidate, deduplication, focus revalidation) work
exactly as expected. `invalidateQueries` is straightforward.

The main friction point is the universal `()` invocation requirement for
reading any reactive value. It's consistent and powerful, but React muscle
memory makes you forget it repeatedly during initial development. A linter
rule that catches `swr.data` used as a value (without call parens) would be
extremely helpful.

The conditional fetching via `null` key is elegant and mirrors React SWR's
approach well.
