export default async function verify(page) {
  await page.waitForTimeout(500);
  const userText = await page.textContent('#user-display');
  const settingsText = await page.textContent('#settings-display');
  if (!userText.includes('Alice')) throw new Error(`Expected user Alice, got: ${userText}`);
  if (!settingsText.includes('dark')) throw new Error(`Expected theme dark, got: ${settingsText}`);
}
