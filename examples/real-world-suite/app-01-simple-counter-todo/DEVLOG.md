# DEVLOG: App 01 - Simple Counter & Todo

Notes from an AI agent encountering What Framework for the first time.

---

## Mistakes I Made (or Almost Made)

### 1. Reaching for `useState` out of habit

My first instinct was to write `const [count, setCount] = useState(0)`. What Framework
does export `useState` for compatibility, but the idiomatic API is `useSignal`. It took
a conscious decision to use `useSignal` instead. The API docs made the distinction clear:
`useState` is a React-style tuple, `useSignal` returns a single signal object.

### 2. Confusing `.set()` with the callable setter

Signals in What Framework support *two* write styles:

```js
count.set(5);   // canonical write
count(5);       // compatibility write (also works)
```

I almost wrote `count.set(count() + 1)` for the increment, which would work but is
less safe than the updater form `count.set(c => c + 1)`. The updater pattern avoids
stale-closure bugs in the same way React's `setState(prev => ...)` does. I stuck with
the updater form.

What caught me off-guard: the existing example apps in the repo mostly use the callable
style (`count(newValue)`) rather than `.set()`. The API docs say `.set()` is "canonical",
but the examples use the shorthand. I went with `.set()` since the docs recommend it,
but it felt odd being different from the repo's own examples.

### 3. Reading a signal requires calling it

In React you just reference `count`. Here you must call `count()` — it is a function.
I kept wanting to write `{count}` in JSX instead of `{count()}`. This is the single
biggest thing that would trip up React developers.

### 4. Almost used `useMemo` instead of `useComputed`

The API has both `useComputed` and `useMemo`. The decision matrix in the docs is:
- `useComputed` — for deriving values from signals (auto-tracks dependencies)
- `useMemo` — for dependency-array memos with non-signal deps

Since my derived values (`remaining`, `label`) depend on signals, `useComputed` is
correct. `useMemo` would also work but requires an explicit dependency array, which
defeats the purpose of the signal system.

---

## What Surprised Me

### Signals are getter functions, not values

Coming from React, the mental model shift is significant. A signal is not a value — it
is a *function that returns a value*. You read with `count()`, write with `count.set(v)`.
Once I internalized this, the code felt clean and concise.

### No re-render of the whole component

In React, calling `setState` re-runs the entire component function. In What Framework,
signal reads are tracked and only the specific DOM nodes that depend on a signal update.
This means the component function body only runs *once* on mount. That explains why
`let nextId = 0` works without `useRef` — the variable persists because the function
is not re-called.

### `.map()` and ternaries just work

I expected to need `<For>` or `<Show>` components for list/conditional rendering (like
SolidJS), but plain `.map()` and ternaries work fine. The framework supports both
patterns. I used the plain JS approach since this is meant to feel familiar to React
developers.

### Event handler casing

The docs note that both `onClick` and `onclick` are accepted. I stuck with `onClick`
(React convention) for familiarity.

---

## What Was Confusing

### 1. When to use `batch()`

The framework exports `batch()` for grouping multiple signal writes. For the counter,
each handler only writes one signal, so batching is unnecessary. But for a more complex
app — say updating both `todos` and `inputText` in `addTodo` — would I need `batch()`?
Looking at the examples, it seems like What Framework may auto-batch within event
handlers (similar to React 18). The existing signal example uses `batch()` explicitly
when writing multiple signals, so I am not 100% sure if it is required or just
a best practice.

### 2. Keys in `.map()`

I used `key={todo.id}` on list items, same as React. The framework seems to respect
keys for efficient reconciliation. The existing examples also use `key`, so this felt
safe. I wonder if the framework does keyed diffing by default or if `key` is required
for correctness.

### 3. `onChange` vs `onInput` for text inputs

In React, `onChange` fires on every keystroke for text inputs (non-standard behavior).
What Framework likely uses native DOM semantics where `onChange` only fires on blur.
I used `onInput` for the todo text field to get per-keystroke updates, which is the
correct choice for native-like frameworks. For the checkbox toggle I used `onChange`,
which fires immediately for checkboxes in both models.

---

## Patterns I Had to Look Up

- **Signal read syntax**: `count()` not `count` or `count.value`
- **Signal write syntax**: `count.set(newValue)` or `count.set(prev => newValue)`
- **Mounting**: `mount(<App />, '#app')` — selector string, not element
- **Computed**: `useComputed(() => ...)` — no dependency array needed
- **Import source**: everything from `'what-framework'`, compiler from `'what-compiler/vite'`
