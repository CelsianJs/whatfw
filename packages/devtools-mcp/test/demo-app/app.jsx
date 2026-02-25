import * as core from 'what-core';
import { signal, effect, derived, mount, h, batch, useSWR } from 'what-core';
import { installDevTools } from 'what-devtools';
import { connectDevToolsMCP } from '../../src/client.js';

// ── DevTools Setup ──
installDevTools(core);
connectDevToolsMCP({ port: 9499 });

// ── Mock Data ──
const INITIAL_TASKS = [
  { id: 1, title: 'Set up CI/CD pipeline', description: 'Configure GitHub Actions for automated testing and deployment', status: 'done', priority: 'high', assignee: 'Alice', createdAt: '2026-02-15' },
  { id: 2, title: 'Design component library', description: 'Create reusable UI components with Storybook documentation', status: 'in-progress', priority: 'high', assignee: 'Bob', createdAt: '2026-02-16' },
  { id: 3, title: 'Implement auth flow', description: 'Add OAuth2 login with Google and GitHub providers', status: 'in-progress', priority: 'high', assignee: 'Alice', createdAt: '2026-02-17' },
  { id: 4, title: 'Write API documentation', description: 'Document all REST endpoints with OpenAPI spec', status: 'todo', priority: 'medium', assignee: 'Charlie', createdAt: '2026-02-18' },
  { id: 5, title: 'Add dark mode support', description: 'Implement theme switching with CSS variables', status: 'todo', priority: 'low', assignee: 'Bob', createdAt: '2026-02-18' },
  { id: 6, title: 'Performance audit', description: 'Run Lighthouse, fix Critical render path, lazy-load images', status: 'todo', priority: 'medium', assignee: 'Alice', createdAt: '2026-02-19' },
  { id: 7, title: 'Database migration', description: 'Migrate from SQLite to PostgreSQL for production', status: 'in-progress', priority: 'high', assignee: 'Charlie', createdAt: '2026-02-19' },
  { id: 8, title: 'Accessibility review', description: 'WCAG 2.1 AA compliance check on all pages', status: 'todo', priority: 'medium', assignee: 'Bob', createdAt: '2026-02-20' },
  { id: 9, title: 'Set up monitoring', description: 'Add Sentry error tracking and Datadog APM', status: 'todo', priority: 'low', assignee: 'Charlie', createdAt: '2026-02-20' },
  { id: 10, title: 'Mobile responsive fix', description: 'Fix sidebar collapse and touch targets on mobile', status: 'in-progress', priority: 'medium', assignee: 'Alice', createdAt: '2026-02-20' },
];

// ── Reactive State ──
const tasks = signal([...INITIAL_TASKS]);
const filter = signal('all');          // 'all' | 'todo' | 'in-progress' | 'done'
const searchQuery = signal('');
const sortBy = signal('newest');       // 'newest' | 'priority' | 'title'
const selectedTaskId = signal(null);
const notification = signal('');
let nextId = 11;

// ── BUG 1: Stale derived — this reads tasks but doesn't react properly ──
// The `derived` uses tasks() inside, which should auto-track, but
// the filter + search + sort pipeline has a subtle issue you can find with what_effects
const filteredTasks = derived(() => {
  let result = tasks();

  // Filter by status
  const f = filter();
  if (f !== 'all') {
    result = result.filter(t => t.status === f);
  }

  // Search
  const q = searchQuery().toLowerCase();
  if (q) {
    result = result.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.assignee.toLowerCase().includes(q)
    );
  }

  // Sort
  const s = sortBy();
  if (s === 'newest') result = [...result].sort((a, b) => b.id - a.id);
  else if (s === 'priority') {
    const order = { high: 0, medium: 1, low: 2 };
    result = [...result].sort((a, b) => order[a.priority] - order[b.priority]);
  }
  else if (s === 'title') result = [...result].sort((a, b) => a.title.localeCompare(b.title));

  return result;
});

// Stats derived from tasks
const stats = derived(() => {
  const all = tasks();
  return {
    total: all.length,
    todo: all.filter(t => t.status === 'todo').length,
    inProgress: all.filter(t => t.status === 'in-progress').length,
    done: all.filter(t => t.status === 'done').length,
  };
});

// Selected task derived
const selectedTask = derived(() => {
  const id = selectedTaskId();
  if (id == null) return null;
  return tasks().find(t => t.id === id) || null;
});

// ── BUG 2: Auto-save effect that fires too often ──
// This effect is supposed to "save" when a task is edited,
// but it runs every time ANY signal in the dependency tree changes
let saveCount = 0;
const autoSaveCount = signal(0);
effect(() => {
  // Reads tasks AND selectedTask — triggers on EVERY task list change
  const t = selectedTask();
  const all = tasks();
  if (t) {
    saveCount++;
    autoSaveCount(saveCount);
    // "Auto-save" side effect
  }
});

// ── BUG 3: Notification timer leak ──
// showNotification sets the signal but the timer that clears it
// creates a new timer each time without clearing the old one
let notifTimer = null;
function showNotification(msg) {
  notification(msg);
  // BUG: doesn't clear previous timer — if called rapidly, messages flash
  notifTimer = setTimeout(() => notification(''), 2000);
}

// ── Actions ──
function addTask() {
  const id = nextId++;
  batch(() => {
    tasks([...tasks(), {
      id,
      title: `New task #${id}`,
      description: 'Click to edit description',
      status: 'todo',
      priority: 'medium',
      assignee: 'Unassigned',
      createdAt: new Date().toISOString().split('T')[0],
    }]);
    selectedTaskId(id);
  });
  showNotification(`Task #${id} created`);
}

function updateTask(id, updates) {
  tasks(tasks().map(t => t.id === id ? { ...t, ...updates } : t));
}

function deleteTask(id) {
  batch(() => {
    tasks(tasks().filter(t => t.id !== id));
    if (selectedTaskId() === id) selectedTaskId(null);
  });
  showNotification(`Task deleted`);
}

// ── Components ──

function Sidebar() {
  const FILTERS = [
    { key: 'all', label: 'All Tasks' },
    { key: 'todo', label: 'To Do' },
    { key: 'in-progress', label: 'In Progress' },
    { key: 'done', label: 'Done' },
  ];

  return h('div', { class: 'sidebar' },
    h('h1', {}, h('span', {}, '⚡'), ' TaskFlow'),

    h('div', { class: 'filter-group' },
      h('label', {}, 'Status'),
      ...FILTERS.map(f =>
        h('button', {
          class: () => `filter-btn ${filter() === f.key ? 'active' : ''}`,
          onclick: () => filter(f.key),
        }, f.label)
      ),
    ),

    h('div', { class: 'filter-group' },
      h('label', {}, 'Assignees'),
      ...['Alice', 'Bob', 'Charlie'].map(name =>
        h('button', {
          class: 'filter-btn',
          onclick: () => searchQuery(name),
        }, name)
      ),
    ),

    h('div', { class: 'stats' },
      h('div', { class: 'stat' },
        h('span', {}, 'Total'),
        h('span', { class: 'val' }, () => `${stats().total}`),
      ),
      h('div', { class: 'stat' },
        h('span', {}, 'To Do'),
        h('span', { class: 'val' }, () => `${stats().todo}`),
      ),
      h('div', { class: 'stat' },
        h('span', {}, 'In Progress'),
        h('span', { class: 'val' }, () => `${stats().inProgress}`),
      ),
      h('div', { class: 'stat' },
        h('span', {}, 'Done'),
        h('span', { class: 'val' }, () => `${stats().done}`),
      ),
      h('div', { class: 'stat', style: 'margin-top: 0.5rem; border-top: 1px solid #1e1e2e; padding-top: 0.5rem' },
        h('span', {}, 'Auto-saves'),
        h('span', { class: 'val', id: 'save-count' }, () => `${autoSaveCount()}`),
      ),
    ),
  );
}

function TaskCard({ task }) {
  return h('div', {
    class: () => `task-card ${selectedTaskId() === task.id ? 'selected' : ''}`,
    onclick: () => selectedTaskId(task.id),
  },
    h('div', { class: 'title' }, task.title),
    h('div', { class: 'meta' },
      h('span', { class: `priority ${task.priority}` }, task.priority),
      h('span', {}, task.assignee),
      h('span', {}, task.status),
      h('span', {}, task.createdAt),
    ),
  );
}

function TaskList() {
  return h('div', { class: 'main' },
    h('div', { class: 'toolbar' },
      h('input', {
        class: 'search-input',
        placeholder: 'Search tasks...',
        oninput: (e) => searchQuery(e.target.value),
      }),
      h('select', {
        class: 'sort-select',
        onchange: (e) => sortBy(e.target.value),
      },
        h('option', { value: 'newest' }, 'Newest First'),
        h('option', { value: 'priority' }, 'By Priority'),
        h('option', { value: 'title' }, 'By Title'),
      ),
      h('button', { class: 'add-btn', onclick: addTask }, '+ Add Task'),
    ),

    h('div', { class: 'task-list' },
      () => {
        const list = filteredTasks();
        if (list.length === 0) {
          return h('div', { class: 'empty-state' }, 'No tasks match your filters');
        }
        return list.map(task =>
          h(TaskCard, { key: task.id, task })
        );
      }
    ),
  );
}

function DetailPanel() {
  return h('div', { class: 'detail' },
    h('h2', {}, 'Task Details'),
    () => {
      const task = selectedTask();
      if (!task) {
        return h('div', { class: 'detail-empty' }, 'Select a task to view details');
      }

      return h('div', {},
        h('div', { class: 'field' },
          h('label', {}, 'Title'),
          h('div', { class: 'field-value' }, task.title),
        ),
        h('div', { class: 'field' },
          h('label', {}, 'Description'),
          h('textarea', {
            value: task.description,
            oninput: (e) => updateTask(task.id, { description: e.target.value }),
          }),
        ),
        h('div', { class: 'field' },
          h('label', {}, 'Priority'),
          h('div', { class: 'field-value' },
            h('span', { class: `priority ${task.priority}` }, task.priority),
          ),
        ),
        h('div', { class: 'field' },
          h('label', {}, 'Assignee'),
          h('div', { class: 'field-value' }, task.assignee),
        ),
        h('div', { class: 'field' },
          h('label', {}, 'Status'),
          h('div', { class: 'status-toggle' },
            ...['todo', 'in-progress', 'done'].map(s =>
              h('button', {
                class: () => `status-btn ${task.status === s ? 'active' : ''}`,
                onclick: () => {
                  updateTask(task.id, { status: s });
                  showNotification(`Status → ${s}`);
                },
              }, s)
            ),
          ),
        ),
        h('div', { style: 'margin-top: 1.5rem' },
          h('button', {
            style: 'background: #ef4444; border: none; border-radius: 6px; padding: 0.5rem 1rem; color: #fff; cursor: pointer; font-size: 0.85rem',
            onclick: () => deleteTask(task.id),
          }, 'Delete Task'),
        ),
      );
    }
  );
}

function NotificationToast() {
  return h('div', {
    class: () => `notification ${notification() ? 'show' : ''}`,
  }, () => notification());
}

function App() {
  return h('div', { class: 'app' },
    h(Sidebar, {}),
    h(TaskList, {}),
    h(DetailPanel, {}),
    h(NotificationToast, {}),
  );
}

mount(h(App, {}), '#app');

// Expose for debugging
window.__WHAT_CORE__ = core;
