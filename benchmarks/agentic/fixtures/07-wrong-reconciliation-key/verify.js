export default async function verify(page) {
  await page.waitForTimeout(200);
  // Before reverse: Build App (index 1) is checked
  const statusBefore = await page.textContent('#status');
  if (!statusBefore.includes('Build App')) throw new Error(`Expected "Build App" checked, got: ${statusBefore}`);

  // Reverse order
  await page.click('#reverse-btn');
  await page.waitForTimeout(200);

  // After reverse: Build App should still be checked (now at index 1 from end)
  const statusAfter = await page.textContent('#status');
  if (!statusAfter.includes('Build App')) throw new Error(`After reverse, expected "Build App" still checked, got: ${statusAfter}`);
}
