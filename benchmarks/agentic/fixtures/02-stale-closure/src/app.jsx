import { signal, effect, mount, h } from 'what-core';

const count = signal(0);
const doubled = signal(0);

// BUG: capturing count.peek() outside effect means the effect
// doesn't track `count` as a dependency. Should read count() inside effect.
const currentCount = count.peek();
effect(() => {
  doubled(currentCount * 2);
});

function App() {
  return h('div', { id: 'app' },
    h('h1', {}, 'Stale Closure Bug'),
    h('p', { id: 'count-display' }, () => `Count: ${count()}`),
    h('p', { id: 'doubled-display' }, () => `Doubled: ${doubled()}`),
    h('button', { id: 'increment-btn', onclick: () => count(count() + 1) }, 'Increment'),
  );
}

mount(h(App, {}), '#app');
