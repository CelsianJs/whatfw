// Simulated API functions
// Each returns a Promise that resolves after a delay to mimic network latency.
// The `signal` parameter (AbortSignal) is forwarded by useSWR so in-flight
// requests can be cancelled when the component unmounts or a new fetch starts.

let shouldError = false;

export function setErrorMode(enabled) {
  shouldError = enabled;
}

function wait(ms, abortSignal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (!abortSignal) return;
    if (abortSignal.aborted) {
      clearTimeout(timer);
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
      return;
    }
    abortSignal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
    }, { once: true });
  });
}

// --- Fetch Users ---
export async function fetchUsers(_key, { signal } = {}) {
  await wait(600, signal);

  if (shouldError) {
    throw new Error('Failed to fetch users: server returned 500');
  }

  const now = new Date().toLocaleTimeString();
  return [
    { id: 1, name: 'Ada Lovelace',   email: 'ada@example.com',   role: 'Admin',     status: 'active',   fetchedAt: now },
    { id: 2, name: 'Linus Torvalds', email: 'linus@example.com', role: 'Developer', status: 'active',   fetchedAt: now },
    { id: 3, name: 'Grace Hopper',   email: 'grace@example.com', role: 'Manager',   status: 'inactive', fetchedAt: now },
    { id: 4, name: 'Alan Turing',    email: 'alan@example.com',  role: 'Developer', status: 'active',   fetchedAt: now },
    { id: 5, name: 'Margaret Hamilton', email: 'margaret@example.com', role: 'Lead', status: 'active',  fetchedAt: now },
  ];
}

// --- Fetch Stats ---
// Called with refreshInterval so it auto-polls.
export async function fetchStats(_key, { signal } = {}) {
  await wait(300, signal);

  if (shouldError) {
    throw new Error('Stats endpoint unavailable');
  }

  return {
    totalUsers: 5,
    activeUsers: 4,
    requestsPerMin: 900 + Math.floor(Math.random() * 300),
    errorRate: Number((Math.random() * 2).toFixed(2)),
    uptime: '99.' + (95 + Math.floor(Math.random() * 5)) + '%',
    refreshedAt: new Date().toLocaleTimeString(),
  };
}

// --- Fetch User Detail ---
// Key format: "user-detail:3"  (the id is parsed from the key)
export async function fetchUserDetail(key, { signal } = {}) {
  const id = Number(key.split(':')[1]);
  await wait(400, signal);

  if (shouldError) {
    throw new Error(`Failed to load user ${id}`);
  }

  const users = {
    1: { id: 1, name: 'Ada Lovelace',      email: 'ada@example.com',      role: 'Admin',     status: 'active',   bio: 'Pioneer of computer programming.', joined: '2021-03-15' },
    2: { id: 2, name: 'Linus Torvalds',     email: 'linus@example.com',    role: 'Developer', status: 'active',   bio: 'Creator of Linux and Git.',         joined: '2020-08-01' },
    3: { id: 3, name: 'Grace Hopper',       email: 'grace@example.com',    role: 'Manager',   status: 'inactive', bio: 'Invented the first compiler.',       joined: '2019-11-20' },
    4: { id: 4, name: 'Alan Turing',        email: 'alan@example.com',     role: 'Developer', status: 'active',   bio: 'Father of theoretical CS and AI.',   joined: '2022-01-10' },
    5: { id: 5, name: 'Margaret Hamilton',   email: 'margaret@example.com', role: 'Lead',      status: 'active',   bio: 'Led Apollo flight software team.',   joined: '2020-06-30' },
  };

  const user = users[id];
  if (!user) throw new Error(`User ${id} not found`);
  return { ...user, fetchedAt: new Date().toLocaleTimeString() };
}
