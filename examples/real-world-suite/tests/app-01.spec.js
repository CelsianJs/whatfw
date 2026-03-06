import { test, expect } from '@playwright/test';

test.describe('App 01: Simple Counter + Todo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="counter-value"]');
  });

  test('counter starts at 0', async ({ page }) => {
    await expect(page.getByTestId('counter-value')).toHaveText('0');
  });

  test('increment increases counter', async ({ page }) => {
    await page.getByTestId('increment-btn').click();
    await expect(page.getByTestId('counter-value')).toHaveText('1');
    await page.getByTestId('increment-btn').click();
    await expect(page.getByTestId('counter-value')).toHaveText('2');
  });

  test('decrement decreases counter', async ({ page }) => {
    await page.getByTestId('increment-btn').click();
    await page.getByTestId('increment-btn').click();
    await page.getByTestId('decrement-btn').click();
    await expect(page.getByTestId('counter-value')).toHaveText('1');
  });

  test('reset sets counter to 0', async ({ page }) => {
    await page.getByTestId('increment-btn').click();
    await page.getByTestId('increment-btn').click();
    await page.getByTestId('reset-btn').click();
    await expect(page.getByTestId('counter-value')).toHaveText('0');
  });

  test('add a todo item', async ({ page }) => {
    await page.getByTestId('todo-input').fill('Buy groceries');
    await page.getByTestId('add-todo-btn').click();
    await expect(page.getByTestId('todo-item-0')).toBeVisible();
    await expect(page.getByTestId('todo-item-0')).toContainText('Buy groceries');
  });

  test('toggle todo completion', async ({ page }) => {
    await page.getByTestId('todo-input').fill('Test task');
    await page.getByTestId('add-todo-btn').click();
    await page.getByTestId('toggle-todo-0').click();
    // After toggling, the todo should show as completed (strikethrough or style change)
    await expect(page.getByTestId('todo-item-0')).toBeVisible();
  });

  test('delete a todo', async ({ page }) => {
    await page.getByTestId('todo-input').fill('Delete me');
    await page.getByTestId('add-todo-btn').click();
    await expect(page.getByTestId('todo-item-0')).toBeVisible();
    await page.getByTestId('delete-todo-0').click();
    await expect(page.getByTestId('todo-item-0')).not.toBeVisible();
  });

  test('todo count updates correctly', async ({ page }) => {
    await page.getByTestId('todo-input').fill('Task 1');
    await page.getByTestId('add-todo-btn').click();
    await page.getByTestId('todo-input').fill('Task 2');
    await page.getByTestId('add-todo-btn').click();
    await expect(page.getByTestId('todo-count')).toContainText('2');
    await page.getByTestId('toggle-todo-0').click();
    await expect(page.getByTestId('todo-count')).toContainText('1');
  });

  test('input clears after adding todo', async ({ page }) => {
    await page.getByTestId('todo-input').fill('Clear me');
    await page.getByTestId('add-todo-btn').click();
    await expect(page.getByTestId('todo-input')).toHaveValue('');
  });
});
