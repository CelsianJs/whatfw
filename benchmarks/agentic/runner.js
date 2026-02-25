#!/usr/bin/env node
/**
 * Agentic Debugging Benchmark Runner
 *
 * Orchestrates benchmark runs:
 * 1. Start Vite dev server for fixture
 * 2. Run WITHOUT-MCP trial (baseline)
 * 3. Reset fixture files
 * 4. Run WITH-MCP trial (treatment)
 * 5. Verify fixes
 * 6. Save results
 *
 * Usage:
 *   node runner.js                     # Run all fixtures
 *   node runner.js --fixture 01        # Run single fixture
 *   node runner.js --runs 3            # 3 runs per fixture (default: 5)
 */

import { createServer } from 'vite';
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, cpSync, mkdirSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { runWithoutMCP } from './harness/agent-without-mcp.js';
import { runWithMCP } from './harness/agent-with-mcp.js';
import { verifyFix } from './harness/verifier.js';
import { injectDevTools, captureConsoleLogs } from './harness/mcp-tool-simulator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, 'fixtures');
const RESULTS_DIR = join(__dirname, 'results');
const SHARED_CONFIG = join(FIXTURES_DIR, 'shared', 'vite.config.js');

// Parse CLI args
const args = process.argv.slice(2);
const fixtureFilter = args.includes('--fixture') ? args[args.indexOf('--fixture') + 1] : null;
const runsPerMode = parseInt(args.includes('--runs') ? args[args.indexOf('--runs') + 1] : '5');
const apiKey = process.env.ANTHROPIC_API_KEY;

if (!apiKey) {
  console.error('Error: ANTHROPIC_API_KEY environment variable required');
  process.exit(1);
}

const FIXTURES = [
  '01-signal-not-reactive',
  '02-stale-closure',
  '03-effect-infinite-loop',
  '04-missing-context-provider',
  '05-cache-key-collision',
  '06-event-handler-tracking',
  '07-wrong-reconciliation-key',
];

async function backupFixture(fixtureDir) {
  const backupDir = join(fixtureDir, '.backup');
  if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });
  cpSync(join(fixtureDir, 'src'), join(backupDir, 'src'), { recursive: true });
}

async function restoreFixture(fixtureDir) {
  const backupDir = join(fixtureDir, '.backup');
  if (existsSync(backupDir)) {
    cpSync(join(backupDir, 'src'), join(fixtureDir, 'src'), { recursive: true });
  }
}

async function startDevServer(fixtureDir, port) {
  const server = await createServer({
    root: fixtureDir,
    configFile: SHARED_CONFIG,
    server: { port, strictPort: true },
    logLevel: 'silent',
  });
  await server.listen();
  return server;
}

async function runFixture(fixtureName) {
  const fixtureDir = join(FIXTURES_DIR, fixtureName);
  const port = 4000 + parseInt(fixtureName.slice(0, 2));
  const results = { fixture: fixtureName, without_mcp: [], with_mcp: [] };

  console.log(`\n=== Fixture: ${fixtureName} ===`);

  // Backup original files
  await backupFixture(fixtureDir);

  for (let run = 0; run < runsPerMode; run++) {
    console.log(`  Run ${run + 1}/${runsPerMode}`);

    // --- WITHOUT MCP ---
    console.log('    Without MCP...');
    await restoreFixture(fixtureDir);
    let server = await startDevServer(fixtureDir, port);
    let browser = await chromium.launch({ headless: true });
    let page = await browser.newPage();
    captureConsoleLogs(page);
    await page.goto(`http://localhost:${port}`);
    await page.waitForTimeout(500);

    try {
      const metricsWithout = await runWithoutMCP({ fixtureDir, page, apiKey });
      const verify = await verifyFix(page, fixtureDir);
      metricsWithout.setFixCorrect(verify.success);
      results.without_mcp.push(metricsWithout.getSummary());
      console.log(`    Without MCP: ${verify.success ? 'PASS' : 'FAIL'} (${metricsWithout.getSummary().time_to_fix_ms}ms)`);
    } catch (e) {
      console.log(`    Without MCP: ERROR - ${e.message}`);
      results.without_mcp.push({ error: e.message, fix_correct: false });
    }

    await page.close();
    await browser.close();
    await server.close();

    // --- WITH MCP ---
    console.log('    With MCP...');
    await restoreFixture(fixtureDir);
    server = await startDevServer(fixtureDir, port);
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
    captureConsoleLogs(page);
    await page.goto(`http://localhost:${port}`);
    await page.waitForTimeout(500);
    await injectDevTools(page);

    try {
      const metricsWith = await runWithMCP({ fixtureDir, page, apiKey });
      const verify = await verifyFix(page, fixtureDir);
      metricsWith.setFixCorrect(verify.success);
      results.with_mcp.push(metricsWith.getSummary());
      console.log(`    With MCP: ${verify.success ? 'PASS' : 'FAIL'} (${metricsWith.getSummary().time_to_fix_ms}ms)`);
    } catch (e) {
      console.log(`    With MCP: ERROR - ${e.message}`);
      results.with_mcp.push({ error: e.message, fix_correct: false });
    }

    await page.close();
    await browser.close();
    await server.close();
  }

  // Restore original files
  await restoreFixture(fixtureDir);

  return results;
}

async function main() {
  mkdirSync(RESULTS_DIR, { recursive: true });

  const fixturesToRun = fixtureFilter
    ? FIXTURES.filter(f => f.includes(fixtureFilter))
    : FIXTURES;

  if (fixturesToRun.length === 0) {
    console.error(`No fixtures matching: ${fixtureFilter}`);
    process.exit(1);
  }

  console.log(`Running ${fixturesToRun.length} fixtures, ${runsPerMode} runs each`);
  console.log(`Total trials: ${fixturesToRun.length * runsPerMode * 2}`);

  const allResults = [];

  for (const fixture of fixturesToRun) {
    const result = await runFixture(fixture);
    allResults.push(result);

    // Save incremental results
    const outPath = join(RESULTS_DIR, `${fixture}.json`);
    writeFileSync(outPath, JSON.stringify(result, null, 2));
  }

  // Save aggregate results
  const aggregate = computeAggregate(allResults);
  writeFileSync(
    join(RESULTS_DIR, 'aggregate.json'),
    JSON.stringify({ fixtures: allResults, aggregate, timestamp: new Date().toISOString() }, null, 2)
  );

  console.log('\n=== Aggregate Results ===');
  console.log(JSON.stringify(aggregate, null, 2));
}

function computeAggregate(results) {
  const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const withoutTokens = results.flatMap(r => r.without_mcp.map(m => m.total_tokens || 0));
  const withTokens = results.flatMap(r => r.with_mcp.map(m => m.total_tokens || 0));
  const withoutTime = results.flatMap(r => r.without_mcp.map(m => m.time_to_fix_ms || 0));
  const withTime = results.flatMap(r => r.with_mcp.map(m => m.time_to_fix_ms || 0));
  const withoutTools = results.flatMap(r => r.without_mcp.map(m => m.tool_calls || 0));
  const withTools = results.flatMap(r => r.with_mcp.map(m => m.tool_calls || 0));
  const withoutAccuracy = results.flatMap(r => r.without_mcp.map(m => m.fix_correct ? 1 : 0));
  const withAccuracy = results.flatMap(r => r.with_mcp.map(m => m.fix_correct ? 1 : 0));
  const withoutScreenshots = results.flatMap(r => r.without_mcp.map(m => m.playwright_screenshots || 0));
  const withScreenshots = results.flatMap(r => r.with_mcp.map(m => m.playwright_screenshots || 0));

  const avgWithoutTokens = avg(withoutTokens);
  const avgWithTokens = avg(withTokens);

  return {
    total_trials: withoutTokens.length + withTokens.length,
    without_mcp: {
      avg_tokens: Math.round(avgWithoutTokens),
      avg_time_ms: Math.round(avg(withoutTime)),
      avg_tool_calls: Math.round(avg(withoutTools) * 10) / 10,
      avg_screenshots: Math.round(avg(withoutScreenshots) * 10) / 10,
      accuracy: Math.round(avg(withoutAccuracy) * 100) + '%',
    },
    with_mcp: {
      avg_tokens: Math.round(avgWithTokens),
      avg_time_ms: Math.round(avg(withTime)),
      avg_tool_calls: Math.round(avg(withTools) * 10) / 10,
      avg_screenshots: Math.round(avg(withScreenshots) * 10) / 10,
      accuracy: Math.round(avg(withAccuracy) * 100) + '%',
    },
    delta: {
      token_savings: avgWithoutTokens > 0
        ? Math.round((1 - avgWithTokens / avgWithoutTokens) * 100) + '%'
        : 'N/A',
      time_savings: avg(withoutTime) > 0
        ? Math.round((1 - avg(withTime) / avg(withoutTime)) * 100) + '%'
        : 'N/A',
      tool_call_reduction: avg(withoutTools) > 0
        ? Math.round((1 - avg(withTools) / avg(withoutTools)) * 100) + '%'
        : 'N/A',
    },
  };
}

main().catch(e => {
  console.error('Runner failed:', e);
  process.exit(1);
});
