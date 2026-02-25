#!/usr/bin/env node
/**
 * Live bridge test — starts the WS bridge on port 9499,
 * waits for the fixture app to connect, then queries state.
 */

import { createBridge } from '../src/bridge.js';

const PORT = 9499;
const bridge = createBridge({ port: PORT });

console.log(`Bridge listening on ws://localhost:${PORT}`);
console.log('Waiting for browser to connect...\n');

// Poll for connection
const poll = setInterval(async () => {
  if (bridge.isConnected()) {
    console.log('Browser connected!');
    clearInterval(poll);

    // Wait a moment for snapshot
    await new Promise(r => setTimeout(r, 500));

    const snapshot = bridge.getSnapshot();
    console.log('\n=== Snapshot ===');
    console.log(JSON.stringify(snapshot, null, 2));

    const events = bridge.getEvents();
    console.log(`\n=== Events (${events.length}) ===`);
    for (const e of events.slice(0, 10)) {
      console.log(`  ${e.event}: ${JSON.stringify(e.data).slice(0, 100)}`);
    }

    const errors = bridge.getErrors();
    console.log(`\n=== Errors (${errors.length}) ===`);

    // Test sendCommand — request fresh snapshot
    try {
      console.log('\n=== Requesting fresh snapshot via command ===');
      const fresh = await bridge.refreshSnapshot();
      console.log('Fresh snapshot signals:', fresh?.signals?.length || 0);
      console.log('Fresh snapshot effects:', fresh?.effects?.length || 0);
      console.log('Fresh snapshot components:', fresh?.components?.length || 0);
    } catch (e) {
      console.log('Command failed:', e.message);
    }

    console.log('\n--- Bridge is live. Ctrl+C to stop. ---');
    console.log('Watching for events...\n');

    // Keep watching events
    let lastCount = events.length;
    setInterval(() => {
      const current = bridge.getEvents();
      if (current.length > lastCount) {
        for (const e of current.slice(lastCount)) {
          console.log(`  [event] ${e.event}: ${JSON.stringify(e.data).slice(0, 120)}`);
        }
        lastCount = current.length;
      }
    }, 500);
  }
}, 500);

// Timeout after 30s
setTimeout(() => {
  if (!bridge.isConnected()) {
    console.log('Timeout: No browser connected after 30s');
    console.log('Make sure the fixture app is running on http://localhost:4001');
    bridge.close();
    process.exit(1);
  }
}, 30000);
