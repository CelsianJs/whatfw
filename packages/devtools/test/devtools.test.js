import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 4599;
const URL = `http://localhost:${PORT}/fixture.html`;

let viteProcess;
let browser;
let page;

// Wait for Vite to be ready
function waitForServer(url, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      fetch(url).then(r => {
        if (r.ok) resolve();
        else if (Date.now() - start > timeout) reject(new Error('Server timeout'));
        else setTimeout(check, 200);
      }).catch(() => {
        if (Date.now() - start > timeout) reject(new Error('Server timeout'));
        else setTimeout(check, 200);
      });
    };
    check();
  });
}

describe('what-devtools', () => {
  before(async () => {
    // Start Vite dev server
    const repoRoot = resolve(__dirname, '..', '..', '..');
    viteProcess = spawn('npx', ['vite', '--config', resolve(__dirname, 'vite.config.js')], {
      cwd: repoRoot,
      stdio: 'pipe',
      env: { ...process.env, NODE_ENV: 'development' },
    });

    // Wait for server
    await waitForServer(URL);

    // Launch browser
    browser = await chromium.launch();
    page = await browser.newPage();
  });

  after(async () => {
    if (browser) await browser.close();
    if (viteProcess) {
      viteProcess.kill('SIGTERM');
      await new Promise(r => viteProcess.on('exit', r));
    }
  });

  test('app renders and devtools install', async () => {
    await page.goto(URL);
    await page.waitForSelector('#title');

    const title = await page.textContent('#title');
    assert.strictEqual(title, 'DevTools Test App');

    // __WHAT_DEVTOOLS__ should be exposed on window
    const hasDevtools = await page.evaluate(() => !!window.__WHAT_DEVTOOLS__);
    assert.strictEqual(hasDevtools, true);
  });

  test('devtools track signals', async () => {
    await page.goto(URL);
    await page.waitForSelector('#title');

    // Wait for signals to be registered (microtask)
    await page.waitForTimeout(100);

    const snapshot = await page.evaluate(() => window.__WHAT_DEVTOOLS__.getSnapshot());

    // Should have tracked signals (count, name, items + any internal ones)
    assert.ok(snapshot.signals.length >= 3, `Expected >= 3 signals, got ${snapshot.signals.length}`);
  });

  test('devtools track effects', async () => {
    await page.goto(URL);
    await page.waitForSelector('#title');
    await page.waitForTimeout(100);

    const snapshot = await page.evaluate(() => window.__WHAT_DEVTOOLS__.getSnapshot());

    // Should have at least 1 effect (the one updating count-display)
    assert.ok(snapshot.effects.length >= 1, `Expected >= 1 effect, got ${snapshot.effects.length}`);
  });

  test('signal updates are reflected in snapshot', async () => {
    await page.goto(URL);
    await page.waitForSelector('#increment');
    await page.waitForTimeout(100);

    // Get initial count signal value
    const before = await page.evaluate(() => {
      const snap = window.__WHAT_DEVTOOLS__.getSnapshot();
      return snap.signals.map(s => ({ name: s.name, value: s.value }));
    });

    // Click increment
    await page.click('#increment');
    await page.waitForTimeout(50);

    // Check snapshot updated
    const after = await page.evaluate(() => {
      const snap = window.__WHAT_DEVTOOLS__.getSnapshot();
      return snap.signals.map(s => ({ name: s.name, value: s.value }));
    });

    // Count display should show 1
    const display = await page.textContent('#count-display');
    assert.strictEqual(display, 'Count: 1');

    // At least one signal value should have changed
    const changed = after.some((s, i) => {
      const prev = before.find(b => b.name === s.name);
      return prev && prev.value !== s.value;
    });
    assert.ok(changed, 'Expected at least one signal value to change after increment');
  });

  test('DevPanel toggle button renders', async () => {
    await page.goto(URL);
    await page.waitForSelector('#title');

    // The DevPanel renders a fixed "W" button
    const wButton = await page.locator('button:has-text("W")').first();
    await wButton.waitFor({ state: 'visible' });

    const text = await wButton.textContent();
    assert.strictEqual(text.trim(), 'W');
  });

  test('DevPanel opens and shows tabs', async () => {
    await page.goto(URL);
    await page.waitForSelector('#title');
    await page.waitForTimeout(200);

    // Click the W toggle button
    const wButton = await page.locator('button:has-text("W")').first();
    await wButton.click();
    await page.waitForTimeout(100);

    // Panel should be visible with tabs
    const signalsTab = await page.locator('button:has-text("Signals")').first();
    const effectsTab = await page.locator('button:has-text("Effects")').first();
    const componentsTab = await page.locator('button:has-text("Components")').first();

    assert.ok(await signalsTab.isVisible(), 'Signals tab should be visible');
    assert.ok(await effectsTab.isVisible(), 'Effects tab should be visible');
    assert.ok(await componentsTab.isVisible(), 'Components tab should be visible');
  });

  test('DevPanel signals tab shows tracked signals', async () => {
    await page.goto(URL);
    await page.waitForSelector('#title');
    await page.waitForTimeout(200);

    // Open the panel
    const wButton = await page.locator('button:has-text("W")').first();
    await wButton.click();
    await page.waitForTimeout(300);

    // Should show signal entries (names are like signal_1, signal_2, etc)
    const panelContent = await page.evaluate(() => {
      // Find the panel container — it has the dark background
      const panels = document.querySelectorAll('div[style*="1a1a2e"]');
      return Array.from(panels).map(p => p.textContent).join(' ');
    });

    // Panel should contain signal-related text
    assert.ok(panelContent.includes('signal') || panelContent.includes('Signal'),
      `Panel should show signal info, got: ${panelContent.slice(0, 200)}`);
  });

  test('DevPanel updates when signals change', async () => {
    await page.goto(URL);
    await page.waitForSelector('#title');
    await page.waitForTimeout(200);

    // Open panel
    const wButton = await page.locator('button:has-text("W")').first();
    await wButton.click();
    await page.waitForTimeout(300);

    // Capture panel content before
    const contentBefore = await page.evaluate(() => {
      const panels = document.querySelectorAll('div[style*="1a1a2e"]');
      return Array.from(panels).map(p => p.textContent).join(' ');
    });

    // Increment the count
    await page.click('#increment');
    // Wait for the 500ms poll interval to pick up the change
    await page.waitForTimeout(600);

    // Capture panel content after
    const contentAfter = await page.evaluate(() => {
      const panels = document.querySelectorAll('div[style*="1a1a2e"]');
      return Array.from(panels).map(p => p.textContent).join(' ');
    });

    // The panel content should have changed (signal value updated)
    assert.notStrictEqual(contentBefore, contentAfter,
      'Panel content should update when signal changes');
  });

  test('DevPanel close button works', async () => {
    await page.goto(URL);
    await page.waitForSelector('#title');
    await page.waitForTimeout(200);

    // Open panel
    const wButton = await page.locator('button:has-text("W")').first();
    await wButton.click();
    await page.waitForTimeout(100);

    // Find and click close button (the "x" button in the header)
    const closeBtn = await page.locator('button:has-text("x")').first();
    await closeBtn.click();
    await page.waitForTimeout(100);

    // Tabs should no longer be visible
    const signalsTab = await page.locator('button:has-text("Signals")').first();
    const isVisible = await signalsTab.isVisible();
    assert.strictEqual(isVisible, false, 'Panel should be hidden after clicking close');
  });

  test('subscribe receives events on signal change', async () => {
    await page.goto(URL);
    await page.waitForSelector('#title');
    await page.waitForTimeout(100);

    const events = await page.evaluate(() => {
      return new Promise(resolve => {
        const collected = [];
        const unsub = window.__TEST__.subscribe((event, data) => {
          collected.push({ event, id: data?.id });
        });

        // Trigger a signal change
        window.__TEST__.count(prev => prev + 1);

        // Give microtasks time to flush
        setTimeout(() => {
          unsub();
          resolve(collected);
        }, 50);
      });
    });

    // Should have received at least a signal:updated event
    const updateEvent = events.find(e => e.event === 'signal:updated');
    assert.ok(updateEvent, `Expected signal:updated event, got: ${JSON.stringify(events)}`);
  });
});
