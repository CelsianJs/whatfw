export default async function verify(page) {
  await page.click('#increment-btn');
  await page.click('#increment-btn');
  await page.waitForTimeout(200);
  const text = await page.textContent('#doubled-display');
  if (!text.includes('4')) throw new Error(`Expected doubled to show 4, got: ${text}`);
}
