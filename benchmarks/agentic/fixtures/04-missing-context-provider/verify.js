export default async function verify(page) {
  const initial = await page.textContent('#themed-btn');
  if (!initial.includes('dark')) throw new Error(`Expected initial theme to be dark, got: ${initial}`);
  await page.click('#toggle-btn');
  await page.waitForTimeout(200);
  const toggled = await page.textContent('#themed-btn');
  if (!toggled.includes('light')) throw new Error(`Expected toggled theme to be light, got: ${toggled}`);
}
