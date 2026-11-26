import { expect, test } from './fixtures.js';

test('a phone shows touch bindings and restores the lobby after closing the guide', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'How to play' }).tap();
  const dialog = page.getByRole('dialog', { name: 'How to play' });
  await expect(dialog.getByText('Left stick', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Drag Cast, then release')).toBeVisible();
  await dialog.getByRole('button', { name: 'Close panel' }).tap();
  await expect(dialog).toHaveCount(0);
  const timer = page.getByRole('button', { name: 'Hunt timer' });
  await timer.tap();
  await page.reload();
  await expect(timer).toHaveAttribute('aria-pressed', 'false');
});
