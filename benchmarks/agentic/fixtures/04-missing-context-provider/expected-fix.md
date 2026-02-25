# Expected Fix
Wrap the children in a Provider:
```
return h('div', { id: 'app' },
  h('h1', {}, 'Missing Context Provider'),
  h(ThemeContext.Provider, { value: () => theme() },
    h(ThemedButton, {}),
    h('button', { id: 'toggle-btn', onclick: () => theme(t => t === 'dark' ? 'light' : 'dark') }, 'Toggle Theme'),
  ),
);
```
The Provider makes the context value available to all descendants.
