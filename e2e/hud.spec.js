import { expect, test } from './fixtures.js';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('a touch player can change HUD layouts mid-hunt and keep using the map and camera', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await page.getByRole('combobox', { name: 'HUD layout' }).selectOption('trail-atlas');
  await page.getByRole('button', { name: 'Start trip' }).tap();
  await expect(page.locator('#counter')).toHaveText('0 / 2', { timeout: 90_000 });
  await expect(page.locator('.map-cardinals')).toBeVisible();
  await page.getByRole('button', { name: 'Open hunt map' }).tap();
  await page.getByRole('button', { name: 'Return to trip' }).tap();

  await page.getByRole('button', { name: 'Pause hunt' }).tap();
  const picker = page.getByRole('dialog').getByRole('combobox', { name: 'HUD layout' });
  await expect(picker).toHaveValue('trail-atlas');
  await picker.selectOption('supper-ticket');
  await page.getByRole('button', { name: 'Resume', exact: true }).tap();
  await expect(page.locator('.hud')).toHaveAttribute('data-layout', 'supper-ticket');
  await expect(page.locator('#hunt-name')).toHaveText('Terminal West');
  await expect(page.locator('.map-cardinals')).toBeHidden();
  await page.setViewportSize({ width: 568, height: 320 });
  await page.locator('#view-toggle').tap();
  await expect(page.locator('#view-name')).toHaveText('Chase cam');

  // A compressed landscape kit still has a clear hit area between both thumbs.
  const kit = await page.locator('#weapon-switch').boundingBox();
  const stick = await page.locator('#stick').boundingBox();
  const flap = await page.locator('#touch-flap').boundingBox();
  expect(kit.height).toBeGreaterThanOrEqual(44);
  expect(kit.x).toBeGreaterThanOrEqual(stick.x + stick.width);
  expect(kit.x + kit.width).toBeLessThanOrEqual(flap.x);

  await page.getByRole('button', { name: 'Pause hunt' }).tap();
  await page.getByRole('button', { name: 'Return to lobby' }).tap();
  await expect(page.getByRole('combobox', { name: 'HUD layout' })).toHaveValue('supper-ticket');
});
