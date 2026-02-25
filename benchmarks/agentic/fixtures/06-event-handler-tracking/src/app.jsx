import { signal, effect, mount, h } from 'what-core';

const items = signal(['Item 1', 'Item 2', 'Item 3']);
const selectedIndex = signal(-1);
const renderCount = signal(0);

function ItemList() {
  // BUG: Reading selectedIndex() inside effect creates a dependency
  // Every time selectedIndex changes, the whole list re-renders
  // instead of just updating the selected style
  effect(() => {
    renderCount(renderCount.peek() + 1);
  });

  return h('div', { id: 'app' },
    h('h1', {}, 'Event Handler Tracking'),
    h('p', { id: 'render-count' }, () => `Renders: ${renderCount()}`),
    h('ul', { id: 'item-list' },
      () => items().map((item, i) =>
        h('li', {
          key: i,
          class: () => selectedIndex() === i ? 'selected' : '',
          onclick: () => selectedIndex(i),
          style: () => selectedIndex() === i ? 'font-weight:bold;background:#eef' : '',
        }, item)
      ),
    ),
  );
}

function App() {
  return h('div', {}, h(ItemList, {}));
}

mount(h(App, {}), '#app');
