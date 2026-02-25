/**
 * Verifier: runs fixture-specific Playwright verification scripts
 * to check if the agent's fix is correct.
 */

import { pathToFileURL } from 'url';
import { join } from 'path';

export async function verifyFix(page, fixtureDir) {
  const verifyPath = join(fixtureDir, 'verify.js');
  try {
    const verifyModule = await import(pathToFileURL(verifyPath).href);
    const verify = verifyModule.default;

    // Reload the page to test the fixed version
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    await verify(page);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
