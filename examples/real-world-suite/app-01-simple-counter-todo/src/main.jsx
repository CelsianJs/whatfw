import { mount, useSignal, useComputed } from 'what-framework';

// ---------------------------------------------------------------------------
// Counter Component
// ---------------------------------------------------------------------------
function Counter() {
  const count = useSignal(0);

  const label = useComputed(() =>
    count() === 0 ? 'zero' : count() > 0 ? 'positive' : 'negative'
  );

  return (
    <section className="card">
      <h2>Counter</h2>

      <div className="counter-display">
        <span data-testid="counter-value" className={`value ${label()}`}>
          {count()}
        </span>
      </div>

      <div className="button-row">
        <button
          data-testid="decrement-btn"
          onClick={() => count.set(c => c - 1)}
        >
          -
        </button>
        <button
          data-testid="reset-btn"
          onClick={() => count.set(0)}
        >
          Reset
        </button>
        <button
          data-testid="increment-btn"
          onClick={() => count.set(c => c + 1)}
        >
          +
        </button>
      </div>

      <p className="hint">
        The count is {label()}.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Todo List Component
// ---------------------------------------------------------------------------
function TodoList() {
  const todos = useSignal([]);
  const inputText = useSignal('');
  let nextId = 0;

  const remaining = useComputed(() =>
    todos().filter(t => !t.done).length
  );

  function addTodo() {
    const text = inputText().trim();
    if (!text) return;
    todos.set(prev => [...prev, { id: nextId++, text, done: false }]);
    inputText.set('');
  }

  function toggleTodo(id) {
    todos.set(prev =>
      prev.map(t => (t.id === id ? { ...t, done: !t.done } : t))
    );
  }

  function deleteTodo(id) {
    todos.set(prev => prev.filter(t => t.id !== id));
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') addTodo();
  }

  return (
    <section className="card">
      <h2>Todo List</h2>

      <div className="input-row">
        <input
          data-testid="todo-input"
          type="text"
          placeholder="What needs to be done?"
          value={inputText()}
          onInput={e => inputText.set(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button data-testid="add-todo-btn" onClick={addTodo}>
          Add
        </button>
      </div>

      <ul className="todo-list">
        {todos().map((todo, index) => (
          <li
            key={todo.id}
            data-testid={`todo-item-${index}`}
            className={todo.done ? 'done' : ''}
          >
            <input
              data-testid={`toggle-todo-${index}`}
              type="checkbox"
              checked={todo.done}
              onChange={() => toggleTodo(todo.id)}
            />
            <span className="todo-text">{todo.text}</span>
            <button
              data-testid={`delete-todo-${index}`}
              className="delete-btn"
              onClick={() => deleteTodo(todo.id)}
            >
              x
            </button>
          </li>
        ))}
      </ul>

      <p data-testid="todo-count" className="hint">
        {remaining() === 1
          ? '1 item left'
          : `${remaining()} items left`}
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// App Root
// ---------------------------------------------------------------------------
function App() {
  return (
    <main className="app-shell">
      <h1>What Framework: Counter & Todo</h1>
      <p className="subtitle">
        Signals, computed values, conditional rendering, and list rendering.
      </p>
      <Counter />
      <TodoList />
    </main>
  );
}

mount(<App />, '#app');
