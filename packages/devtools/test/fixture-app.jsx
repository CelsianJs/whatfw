import { signal, effect, mount, __setDevToolsHooks } from 'what-core';
import { installDevTools, getSnapshot, subscribe } from 'what-devtools';
import { DevPanel } from 'what-devtools/panel';

// Install devtools first — pass core for synchronous hook setup
installDevTools({ __setDevToolsHooks });

// Create some signals for the devtools to track
const count = signal(0);
const name = signal('hello');
const items = signal([1, 2, 3]);

// Create an effect
effect(() => {
  const el = document.getElementById('count-display');
  if (el) el.textContent = `Count: ${count()}`;
});

// Simple test app
function App() {
  return (
    <>
      <h1 id="title">DevTools Test App</h1>
      <div id="count-display">Count: 0</div>
      <button id="increment" onclick={() => count(c => c + 1)}>+1</button>
      <button id="set-name" onclick={() => name('world')}>Set Name</button>
      <DevPanel />
    </>
  );
}

mount(App, '#app');

// Expose for Playwright
window.__TEST__ = { count, name, items, getSnapshot, subscribe };
