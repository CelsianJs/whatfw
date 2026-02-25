#!/usr/bin/env node
/**
 * Live MCP tool test — starts the full MCP server (bridge + tools),
 * connects a client via stdio, and calls each tool.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(__dirname, '../src/index.js');

console.log('Starting MCP server via stdio...\n');

const transport = new StdioClientTransport({
  command: 'node',
  args: [serverPath],
  env: { ...process.env, WHAT_MCP_PORT: '9499' },
});

const client = new Client({ name: 'test-client', version: '1.0.0' });
await client.connect(transport);

console.log('Connected to MCP server!');
console.log('Waiting for browser to connect (reload the page if needed)...\n');

// Wait for browser connection (up to 15 seconds)
for (let i = 0; i < 30; i++) {
  const status = await client.callTool({ name: 'what_connection_status', arguments: {} });
  const text = status.content?.[0]?.text || '{}';
  const parsed = JSON.parse(text);
  if (parsed.connected) {
    console.log('Browser connected!\n');
    break;
  }
  if (i === 29) {
    console.log('WARNING: No browser connected after 15s. Tools will return errors.');
  }
  await new Promise(r => setTimeout(r, 500));
}

// List all tools
const { tools } = await client.listTools();
console.log(`=== ${tools.length} Tools Available ===`);
for (const t of tools) {
  console.log(`  ${t.name} — ${t.description?.slice(0, 60)}`);
}

// Helper to call a tool
async function call(name, args = {}) {
  console.log(`\n>>> ${name}(${JSON.stringify(args)})`);
  try {
    const result = await client.callTool({ name, arguments: args });
    const text = result.content?.[0]?.text || JSON.stringify(result);
    // Parse if JSON
    try {
      const parsed = JSON.parse(text);
      console.log(JSON.stringify(parsed, null, 2));
    } catch {
      console.log(text);
    }
  } catch (e) {
    console.log(`ERROR: ${e.message}`);
  }
}

// Test each tool
await call('what_connection_status');
await call('what_signals');
await call('what_signals', { filter: 'signal_1' });
await call('what_effects');
await call('what_components');
await call('what_errors');
await call('what_snapshot');
await call('what_cache');

// Test set_signal — change count to 42
await call('what_set_signal', { signalId: 1, value: 42 });

// Verify signal changed
await call('what_signals', { filter: 'signal_1' });

// Test watch — collect 2 seconds of events
console.log('\n>>> what_watch (2 seconds)...');
await call('what_watch', { duration: 2000 });

console.log('\n=== All tools tested! ===');

await client.close();
process.exit(0);
