import { signal, effect, mount, h } from 'what-core';

const count = signal(0);

function Counter() {
  return h('div', {},
    h('h1', {}, 'Counter App'),
    // BUG: count is a signal function, not reactive text. Should be () => count()
    h('p', { id: 'count-display' }, count),
    h('button', { id: 'increment-btn', onclick: () => count(count() + 1) }, 'Increment'),
  );
}

function App() {
  return h('div', { id: 'app' }, h(Counter, {}));
}

mount(h(App, {}), '#app');
