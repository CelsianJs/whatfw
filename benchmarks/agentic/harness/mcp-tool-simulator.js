/**
 * MCP Tool Simulator
 * Injects devtools into the page and provides the same tools as the real MCP bridge,
 * but via page.evaluate() instead of WebSocket. Functionally identical for benchmarking.
 */

export async function injectDevTools(page) {
  await page.evaluate(() => {
    // Check if devtools are already installed
    if (window.__WHAT_DEVTOOLS__) return;

    // Try to install devtools dynamically
    // The fixture apps should import what-devtools themselves,
    // but as a fallback we check for the core module
    console.log('[benchmark] DevTools injection: checking for existing installation');
  });

  // Wait for devtools to be available (fixture app should install them)
  try {
    await page.waitForFunction(() => !!window.__WHAT_DEVTOOLS__, { timeout: 5000 });
    return true;
  } catch {
    console.warn('[benchmark] DevTools not available after 5s — MCP tools will return errors');
    return false;
  }
}

/**
 * Set up console log capture on a page.
 */
export function captureConsoleLogs(page) {
  page._consoleLogs = [];
  page.on('console', (msg) => {
    page._consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    // Cap at 500 messages
    if (page._consoleLogs.length > 500) {
      page._consoleLogs = page._consoleLogs.slice(-250);
    }
  });
}
