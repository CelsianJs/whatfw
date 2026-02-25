import { signal, mount, h, createContext, useContext } from 'what-core';

const ThemeContext = createContext('light');

function ThemedButton() {
  // BUG: No ThemeContext.Provider in the tree above this component
  const theme = useContext(ThemeContext);
  return h('button', {
    id: 'themed-btn',
    style: () => `background: ${theme === 'dark' ? '#333' : '#fff'}; color: ${theme === 'dark' ? '#fff' : '#333'}; padding: 10px 20px;`
  }, () => `Theme: ${theme}`);
}

function App() {
  const theme = signal('dark');
  // BUG: Missing ThemeContext.Provider wrapper
  return h('div', { id: 'app' },
    h('h1', {}, 'Missing Context Provider'),
    h(ThemedButton, {}),
    h('button', { id: 'toggle-btn', onclick: () => theme(t => t === 'dark' ? 'light' : 'dark') }, 'Toggle Theme'),
  );
}

mount(h(App, {}), '#app');
