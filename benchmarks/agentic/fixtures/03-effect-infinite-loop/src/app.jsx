import { signal, effect, mount, h } from 'what-core';

const count = signal(0);
const log = signal([]);

// BUG: This effect reads count() (subscribes) and then writes to count() (triggers re-run).
// Should use untrack() to read without subscribing, or use separate signals.
effect(() => {
  const current = count();
  log(prev => [...prev, `Count changed to ${current}`]);
  if (current < 5) {
    count(current + 1); // writes to signal we're subscribed to = infinite loop
  }
});

function App() {
  return h('div', { id: 'app' },
    h('h1', {}, 'Effect Loop Bug'),
    h('p', { id: 'count-display' }, () => `Count: ${count()}`),
    h('p', { id: 'log-display' }, () => `Log entries: ${log().length}`),
  );
}

mount(h(App, {}), '#app');
