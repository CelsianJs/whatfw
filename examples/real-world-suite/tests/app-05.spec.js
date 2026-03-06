import { test, expect } from '@playwright/test';

test.describe('App 05: React Compat (Zustand)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="product-list"]');
  });

  test('renders product list', async ({ page }) => {
    await expect(page.getByTestId('product-list')).toBeVisible();
    const products = page.locator('[data-testid^="product-"]').filter({ hasNotText: 'list' });
    const count = await products.count();
    expect(count).toBeGreaterThan(0);
  });

  test('add item to cart', async ({ page }) => {
    const addBtn = page.locator('[data-testid^="add-to-cart-"]').first();
    await addBtn.click();
    await expect(page.getByTestId('cart-count')).toContainText('1');
  });

  test('open cart sidebar', async ({ page }) => {
    // Add an item first
    const addBtn = page.locator('[data-testid^="add-to-cart-"]').first();
    await addBtn.click();
    await page.getByTestId('cart-toggle').click();
    await expect(page.getByTestId('cart-sidebar')).toBeVisible();
  });

  test('cart shows added items', async ({ page }) => {
    const addBtn = page.locator('[data-testid^="add-to-cart-"]').first();
    await addBtn.click();
    await page.getByTestId('cart-toggle').click();
    const cartItems = page.locator('[data-testid^="cart-item-"]');
    await expect(cartItems.first()).toBeVisible();
  });

  test('remove item from cart', async ({ page }) => {
    const addBtn = page.locator('[data-testid^="add-to-cart-"]').first();
    await addBtn.click();
    await page.getByTestId('cart-toggle').click();
    const removeBtn = page.locator('[data-testid^="remove-from-cart-"]').first();
    await removeBtn.click();
    await expect(page.getByTestId('cart-count')).toContainText('0');
  });

  test('cart total updates correctly', async ({ page }) => {
    const addBtn = page.locator('[data-testid^="add-to-cart-"]').first();
    await addBtn.click();
    await addBtn.click();
    await page.getByTestId('cart-toggle').click();
    const total = page.getByTestId('cart-total');
    await expect(total).toBeVisible();
    const text = await total.textContent();
    // Total should contain a dollar amount
    expect(text).toMatch(/\$/);
  });

  test('search filters products', async ({ page }) => {
    const initialCount = await page.locator('[data-testid^="product-"]:not([data-testid="product-list"])').count();
    await page.getByTestId('search-input').fill('nonexistent-product-xyz');
    await page.waitForTimeout(200);
    const filteredCount = await page.locator('[data-testid^="product-"]:not([data-testid="product-list"])').count();
    expect(filteredCount).toBeLessThan(initialCount);
  });
});
