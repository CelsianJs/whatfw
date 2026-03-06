import { defineConfig } from '@playwright/test';

const apps = [
  { name: 'app-01-simple-counter-todo', port: 5501 },
  { name: 'app-02-api-cache-dashboard', port: 5502 },
  { name: 'app-03-global-state', port: 5503 },
  { name: 'app-04-virtual-table', port: 5504 },
  { name: 'app-05-react-compat', port: 5505 },
];

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  expect: { timeout: 5000 },
  fullyParallel: false,
  retries: 1,
  use: {
    headless: true,
    screenshot: 'only-on-failure',
  },
  projects: apps.map(app => ({
    name: app.name,
    testMatch: `app-${app.name.split('-')[1]}*.spec.js`,
    use: { baseURL: `http://localhost:${app.port}` },
  })),
  webServer: apps.map(app => ({
    command: `cd ${app.name} && npx vite --port ${app.port} --strictPort`,
    port: app.port,
    reuseExistingServer: true,
    timeout: 30000,
  })),
});
