# eslint-plugin-what

ESLint rules for [What Framework](https://whatfw.com). Catches common signal bugs and enforces framework patterns. Designed for ESLint 9+ flat config.

## Install

```bash
npm install eslint-plugin-what --save-dev
```

Requires ESLint 9 or later.

## Setup

```js
// eslint.config.js
import what from 'eslint-plugin-what';

export default [
  what.configs.recommended,
];
```

## Configs

| Config | Description |
|---|---|
| `what.configs.recommended` | Balanced rules as warnings |
| `what.configs.strict` | All rules as errors + `prefer-set` |
| `what.configs.compiler` | For projects using the What compiler (disables rules the compiler handles) |

## Rules

### `what/no-signal-in-effect-deps`

Prevents passing signal getters as effect dependencies. Signals are already reactive -- including them in deps arrays causes effects to re-run on every render.

```js
// Bad
useEffect(() => { ... }, [count()]);

// Good
useEffect(() => { ... }, []);
```

### `what/reactive-jsx-children`

Ensures dynamic values in JSX are wrapped in reactive functions so they update when signals change.

```jsx
// Bad - won't update
<p>{count()}</p>

// Good
<p>{() => count()}</p>
```

### `what/no-signal-write-in-render`

Prevents writing to signals during component render, which can cause infinite re-render loops.

```jsx
// Bad
function App() {
  count.set(5); // writing during render
  return <p>{count()}</p>;
}

// Good
function App() {
  useEffect(() => { count.set(5); }, []);
  return <p>{() => count()}</p>;
}
```

### `what/no-camelcase-events`

Enforces lowercase event handler names (`onclick` instead of `onClick`). What Framework uses lowercase events natively.

```jsx
// Bad
<button onClick={handler}>

// Good
<button onclick={handler}>
```

### `what/prefer-set`

Suggests using `signal.set()` instead of reassignment for signal updates. Off by default.

## Config Details

### recommended

```js
{
  'what/no-signal-in-effect-deps': 'warn',
  'what/reactive-jsx-children': 'warn',
  'what/no-signal-write-in-render': 'warn',
  'what/no-camelcase-events': 'warn',
  'what/prefer-set': 'off',
}
```

### strict

```js
{
  'what/no-signal-in-effect-deps': 'error',
  'what/reactive-jsx-children': 'error',
  'what/no-signal-write-in-render': 'error',
  'what/no-camelcase-events': 'error',
  'what/prefer-set': 'warn',
}
```

### compiler

```js
{
  'what/no-signal-in-effect-deps': 'warn',
  'what/reactive-jsx-children': 'off',       // compiler handles reactive wrapping
  'what/no-signal-write-in-render': 'warn',
  'what/no-camelcase-events': 'off',          // compiler normalizes events
  'what/prefer-set': 'off',
}
```

## Links

- [Documentation](https://whatfw.com)
- [GitHub](https://github.com/CelsianJs/whatfw)

## License

MIT
