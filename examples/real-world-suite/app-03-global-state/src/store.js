// Store — global state for Project Task Manager
// Demonstrates createStore with derived fields, actions, filters, sorting, and search.

import { createStore, derived } from 'what-framework';

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

export const useTaskStore = createStore({
  // --- State fields ---
  tasks: [],
  filter: 'all',       // 'all' | 'active' | 'done'
  sortBy: 'date',      // 'date' | 'priority'
  searchQuery: '',

  // --- Derived fields ---
  // derived() receives the store STATE as its parameter, NOT `this`.
  // This is the key distinction from actions which use `this`.

  filteredTasks: derived((state) => {
    let list = state.tasks;

    // Apply search filter
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      list = list.filter(t => t.title.toLowerCase().includes(q));
    }

    // Apply status filter
    if (state.filter === 'active') {
      list = list.filter(t => !t.done);
    } else if (state.filter === 'done') {
      list = list.filter(t => t.done);
    }

    // Apply sorting
    if (state.sortBy === 'priority') {
      list = [...list].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
    } else {
      list = [...list].sort((a, b) => b.createdAt - a.createdAt);
    }

    return list;
  }),

  taskCounts: derived((state) => ({
    total: state.tasks.length,
    active: state.tasks.filter(t => !t.done).length,
    done: state.tasks.filter(t => t.done).length,
  })),

  hasActiveTasks: derived((state) => state.tasks.some(t => !t.done)),

  // --- Actions ---
  // Actions use `this` to read and mutate state. Always spread arrays for immutability.

  addTask(title, priority) {
    const trimmed = title.trim();
    if (!trimmed) return;
    this.tasks = [
      ...this.tasks,
      {
        id: Date.now(),
        title: trimmed,
        priority: priority || 'medium',
        done: false,
        createdAt: Date.now(),
      },
    ];
  },

  toggleTask(id) {
    this.tasks = this.tasks.map(t =>
      t.id === id ? { ...t, done: !t.done } : t
    );
  },

  deleteTask(id) {
    this.tasks = this.tasks.filter(t => t.id !== id);
  },

  setFilter(value) {
    this.filter = value;
  },

  setSort(value) {
    this.sortBy = value;
  },

  setSearch(query) {
    this.searchQuery = query;
  },

  clearCompleted() {
    this.tasks = this.tasks.filter(t => !t.done);
  },
});
