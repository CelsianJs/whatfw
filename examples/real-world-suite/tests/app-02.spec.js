import { test, expect } from '@playwright/test';

test.describe('App 02: API Cache Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for initial data load
    await page.waitForSelector('[data-testid="user-list"]', { timeout: 10000 });
  });

  test('loads and displays user list', async ({ page }) => {
    await expect(page.getByTestId('user-list')).toBeVisible();
    // Should have at least one user item
    const items = page.locator('[data-testid^="user-item-"]');
    await expect(items.first()).toBeVisible({ timeout: 5000 });
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
  });

  test('shows stats panel', async ({ page }) => {
    await expect(page.getByTestId('stats-panel')).toBeVisible({ timeout: 5000 });
  });

  test('clicking a user shows detail', async ({ page }) => {
    const firstUser = page.locator('[data-testid^="user-item-"]').first();
    await firstUser.click();
    await expect(page.getByTestId('user-detail')).toBeVisible({ timeout: 5000 });
  });

  test('refresh button triggers revalidation', async ({ page }) => {
    await page.getByTestId('refresh-btn').click();
    // Should still show the list after refresh
    await expect(page.getByTestId('user-list')).toBeVisible();
  });

  test('error simulation shows error message', async ({ page }) => {
    await page.getByTestId('error-btn').click();
    await expect(page.getByTestId('error-message')).toBeVisible({ timeout: 5000 });
  });
});
