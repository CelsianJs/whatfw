export default async function verify(page) {
  // Should NOT see the infinite loop warning
  const logs = [];
  page.on('console', msg => logs.push(msg.text()));
  await page.waitForTimeout(500);
  const hasLoop = logs.some(l => l.includes('infinite effect loop'));
  if (hasLoop) throw new Error('Infinite effect loop still detected');
  const text = await page.textContent('#count-display');
  if (!text) throw new Error('Count display not found');
}
