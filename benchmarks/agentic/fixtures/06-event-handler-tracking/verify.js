export default async function verify(page) {
  await page.waitForTimeout(200);
  const initialCount = await page.textContent('#render-count');
  const initialNum = parseInt(initialCount.match(/\d+/)?.[0] || '0');

  // Click 3 items
  const items = await page.$$('#item-list li');
  if (items.length >= 3) {
    await items[0].click();
    await items[1].click();
    await items[2].click();
  }
  await page.waitForTimeout(200);

  const finalCount = await page.textContent('#render-count');
  const finalNum = parseInt(finalCount.match(/\d+/)?.[0] || '0');

  // Should not have excessive renders (more than 10 for 3 clicks is excessive)
  const renderIncrease = finalNum - initialNum;
  if (renderIncrease > 10) throw new Error(`Excessive re-renders: ${renderIncrease} renders for 3 clicks`);
}
