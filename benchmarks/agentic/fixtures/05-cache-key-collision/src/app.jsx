import { signal, mount, h } from 'what-core';
import { useSWR } from 'what-core';

// Mock fetcher
const fetchUser = (key) => Promise.resolve({ name: 'Alice', role: 'admin' });
const fetchSettings = (key) => Promise.resolve({ theme: 'dark', lang: 'en' });

function UserProfile() {
  // BUG: Both use '/api/data' as key — second overwrites first in shared cache
  const { data: user } = useSWR('/api/data', fetchUser);
  const { data: settings } = useSWR('/api/data', fetchSettings);

  return h('div', { id: 'app' },
    h('h1', {}, 'Cache Key Collision'),
    h('p', { id: 'user-display' }, () => `User: ${user()?.name || 'loading...'}`),
    h('p', { id: 'settings-display' }, () => `Theme: ${settings()?.theme || 'loading...'}`),
  );
}

function App() {
  return h('div', {}, h(UserProfile, {}));
}

mount(h(App, {}), '#app');
