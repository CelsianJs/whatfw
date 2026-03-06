import { test, expect } from '@playwright/test';

test.describe('App 03: Global State Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="task-input"]');
  });

  test('add a task', async ({ page }) => {
    await page.getByTestId('task-input').fill('Build feature');
    await page.getByTestId('add-task-btn').click();
    const items = page.locator('[data-testid^="task-item-"]');
    await expect(items.first()).toBeVisible();
    await expect(items.first()).toContainText('Build feature');
  });

  test('add task with priority', async ({ page }) => {
    await page.getByTestId('task-input').fill('Urgent fix');
    await page.getByTestId('priority-select').selectOption('high');
    await page.getByTestId('add-task-btn').click();
    const items = page.locator('[data-testid^="task-item-"]');
    await expect(items.first()).toContainText('Urgent fix');
  });

  test('toggle task completion', async ({ page }) => {
    await page.getByTestId('task-input').fill('Toggle me');
    await page.getByTestId('add-task-btn').click();
    const toggleBtn = page.locator('[data-testid^="toggle-task-"]').first();
    await toggleBtn.click();
    // Task should be marked done
    await expect(page.locator('[data-testid^="task-item-"]').first()).toBeVisible();
  });

  test('delete a task', async ({ page }) => {
    await page.getByTestId('task-input').fill('Delete me');
    await page.getByTestId('add-task-btn').click();
    const deleteBtn = page.locator('[data-testid^="delete-task-"]').first();
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();
    await expect(page.locator('[data-testid^="task-item-"]')).toHaveCount(0);
  });

  test('filter tasks by status', async ({ page }) => {
    // Add two tasks
    await page.getByTestId('task-input').fill('Active task');
    await page.getByTestId('add-task-btn').click();
    await page.getByTestId('task-input').fill('Done task');
    await page.getByTestId('add-task-btn').click();

    // Toggle the "Done task" item (find its toggle button within its row)
    const doneTaskRow = page.locator('[data-testid^="task-item-"]', { hasText: 'Done task' });
    await doneTaskRow.locator('[data-testid^="toggle-task-"]').click();

    // Filter to active only
    await page.getByTestId('filter-active').click();
    const items = page.locator('[data-testid^="task-item-"]');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText('Active task');

    // Filter to done only
    await page.getByTestId('filter-done').click();
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText('Done task');

    // Show all
    await page.getByTestId('filter-all').click();
    await expect(items).toHaveCount(2);
  });

  test('search filters tasks', async ({ page }) => {
    await page.getByTestId('task-input').fill('Alpha task');
    await page.getByTestId('add-task-btn').click();
    await page.getByTestId('task-input').fill('Beta task');
    await page.getByTestId('add-task-btn').click();

    await page.getByTestId('search-input').fill('Alpha');
    const items = page.locator('[data-testid^="task-item-"]');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText('Alpha');
  });

  test('clear completed removes done tasks', async ({ page }) => {
    await page.getByTestId('task-input').fill('Keep me');
    await page.getByTestId('add-task-btn').click();
    await page.getByTestId('task-input').fill('Clear me');
    await page.getByTestId('add-task-btn').click();

    // Toggle the "Clear me" item specifically
    const clearRow = page.locator('[data-testid^="task-item-"]', { hasText: 'Clear me' });
    await clearRow.locator('[data-testid^="toggle-task-"]').click();

    await page.getByTestId('clear-completed-btn').click();
    const items = page.locator('[data-testid^="task-item-"]');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText('Keep me');
  });

  test('task count updates', async ({ page }) => {
    await page.getByTestId('task-input').fill('Task 1');
    await page.getByTestId('add-task-btn').click();
    await page.getByTestId('task-input').fill('Task 2');
    await page.getByTestId('add-task-btn').click();
    await expect(page.getByTestId('task-count')).toContainText('2');
  });
});
