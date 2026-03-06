# DEVLOG: App 03 - Global State (Project Task Manager)

Agent developer experience notes for `createStore` + `derived()` in What Framework.

## How `derived()` works

`derived()` wraps a function that receives the **store state as a parameter**, NOT `this`. This is the single most important distinction in the store API. The framework creates a proxy object representing current state and passes it in:

```js
filteredTasks: derived((state) => {
  // state.tasks, state.filter, state.searchQuery — all reactive reads
  return state.tasks.filter(t => ...);
}),
```

Under the hood, `derived()` just marks the function with `_storeComputed = true` so `createStore` can distinguish it from actions. Then `createStore` wraps it in a `computed()` call with a proxy that reads the underlying signals.

## How store actions use `this`

Actions are the opposite of derived: they use `this` to both read and write state. The framework binds `this` to a proxy that `.get()` reads signals and `.set()` writes them:

```js
addTask(title, priority) {
  this.tasks = [...this.tasks, { id: Date.now(), title, priority, done: false, createdAt: Date.now() }];
},
toggleTask(id) {
  this.tasks = this.tasks.map(t => t.id === id ? { ...t, done: !t.done } : t);
},
```

Actions are automatically batched — multiple signal writes in one action only trigger one re-render cycle.

## Confusion: `derived` vs `useComputed`

- `derived()` is for **store-level** computed fields. It lives inside the `createStore({})` definition.
- `useComputed()` is for **component-level** computed values, used inside component functions.
- They do the same thing conceptually (reactive computed), but `derived` is specifically tagged so the store can identify it. You cannot use `useComputed` inside a store definition.

## Using the store in components

Call the hook returned by `createStore()`. Every component gets the same reactive snapshot:

```js
const useTaskStore = createStore({ ... });

function MyComponent() {
  const store = useTaskStore();  // call the hook
  // store.tasks, store.filteredTasks, store.addTask() — all available
}
```

Multiple components calling `useTaskStore()` share the same underlying signals. No prop drilling needed.

## Gotchas with immutability

You MUST spread arrays when mutating in actions. Direct mutation like `this.tasks.push(...)` does NOT trigger reactivity — the signal's reference hasn't changed. Always assign a new array:

```js
// WRONG — won't trigger updates
this.tasks.push(newTask);

// CORRECT — new array reference triggers signal update
this.tasks = [...this.tasks, newTask];
```

Same applies for `.map()`, `.filter()`, `.sort()` — `.map()` and `.filter()` already return new arrays, but `.sort()` mutates in place, so spread first: `[...list].sort(...)`.

## Did `createStore` feel natural?

Yes, mostly. The Zustand-like single-object definition is ergonomic — state, derived, and actions all in one place. The split between `derived((state) => ...)` and `action() { this.x = ... }` is logical once you know the rule: derived reads via parameter, actions read/write via `this`.

The `derived()` wrapper is necessary because without it, `createStore` can't tell a computed function from an action that takes one argument. Explicit is better than magic here.

## Mistakes: using `this` in derived

My first instinct was to write:

```js
filteredTasks: derived(function() {
  return this.tasks.filter(...);  // WRONG — `this` is undefined in derived
}),
```

This does not work. `derived()` functions receive state as a parameter, period. The framework passes a read-only proxy as the argument. There is no `this` binding for derived functions. The fix is always:

```js
filteredTasks: derived((state) => {
  return state.tasks.filter(...);  // CORRECT — state parameter
}),
```

The dev-mode warning (`derived() for "X" should accept the state parameter`) helps catch this if you forget the parameter entirely.
