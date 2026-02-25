import { signal, mount, h } from 'what-core';

const todos = signal([
  { id: 'a', text: 'Learn What', done: false },
  { id: 'b', text: 'Build App', done: true },
  { id: 'c', text: 'Ship It', done: false },
]);

function TodoItem({ todo, onToggle }) {
  return h('li', {},
    h('input', {
      type: 'checkbox',
      checked: todo.done,
      onchange: () => onToggle(todo.id),
    }),
    h('span', {
      style: todo.done ? 'text-decoration: line-through' : '',
    }, todo.text),
  );
}

function App() {
  const toggle = (id) => {
    todos(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));
  };

  const reverse = () => {
    todos(prev => [...prev].reverse());
  };

  return h('div', { id: 'app' },
    h('h1', {}, 'Todo List'),
    h('button', { id: 'reverse-btn', onclick: reverse }, 'Reverse Order'),
    h('ul', { id: 'todo-list' },
      // BUG: Using index as key instead of item.id
      // When list is reversed, indices stay the same but items change position
      // This causes wrong checkbox state association
      () => todos().map((todo, index) =>
        h(TodoItem, { key: index, todo, onToggle: toggle })
      ),
    ),
    h('p', { id: 'status' }, () => {
      const t = todos();
      const doneItem = t.find(x => x.done);
      return `Checked item: ${doneItem ? doneItem.text : 'none'}`;
    }),
  );
}

mount(h(App, {}), '#app');
