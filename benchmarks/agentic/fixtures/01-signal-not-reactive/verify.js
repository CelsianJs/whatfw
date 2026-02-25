// Playwright verification script
export default async function verify(page) {
  await page.click('#increment-btn');
  await page.click('#increment-btn');
  await page.click('#increment-btn');
  await page.waitForTimeout(200);
  const text = await page.textContent('#count-display');
  if (!text.includes('3')) throw new Error(`Expected count display to show 3, got: ${text}`);
}
