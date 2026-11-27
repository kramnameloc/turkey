import { expect, test } from './fixtures.js';

test('the field guide opens from the lobby, switches sections and restores keyboard focus', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.locator('meta[http-equiv="Content-Security-Policy"]')
  ).toHaveAttribute('content', /script-src 'self';/);
  const guide = page.getByRole('button', { name: 'Field guide', exact: true });
  await guide.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Corn on the cob')).toBeVisible();
  await dialog.getByRole('button', { name: 'Desserts' }).click();
  await expect(dialog.getByText('Lattice apple pie')).toBeVisible();
  await dialog.getByRole('button', { name: 'Trip days' }).click();
  await expect(
    dialog.getByRole('heading', { name: 'Six days in Colorado' })
  ).toBeVisible();
  await expect(dialog.getByRole('listitem')).toHaveCount(18);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(guide).toBeFocused();
});

test('timer and audio choices survive a reload', async ({ page }) => {
  await page.goto('/');
  const timer = page.getByRole('button', { name: 'Hunt timer' });
  await expect(timer).toHaveAttribute('aria-pressed', 'true');
  await timer.click();
  await page.getByRole('button', { name: 'Mute audio' }).click();
  await page.reload();
  await expect(timer).toHaveAttribute('aria-pressed', 'false');
  await expect(timer).toContainText('Off · No time limit');
  await expect(
    page.getByRole('button', { name: 'Enable audio' })
  ).toHaveAttribute('aria-pressed', 'false');
});

test('a failed city map loads on the next visit and remembers the selected stop', async ({
  page,
}) => {
  await page.route(
    '**/geo/region.json',
    (route) => route.fulfill({ status: 503 }),
    { times: 1 }
  );
  await page.goto('/');
  const mapButton = page.getByRole('button', { name: 'Hunt map', exact: true });
  const dialog = page.getByRole('dialog');
  await mapButton.click();
  await dialog.getByRole('button', { name: 'Greater Broomfield' }).click();
  await expect(
    dialog.getByText('Map data could not load. Reopen the map to retry.')
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Close panel' }).click();
  await mapButton.click();
  await dialog.getByRole('button', { name: 'Greater Broomfield' }).click();
  const canvas = dialog.getByLabel('Map of the hunt area');
  await expect
    .poll(() =>
      canvas.evaluate(
        (map) => map.getContext('2d').getImageData(0, 0, 1, 1).data[3]
      )
    )
    .toBe(255);
  await dialog
    .getByRole('combobox')
    .selectOption({ label: 'Brunner Farmhouse' });
  await dialog.getByRole('button', { name: 'Community Park' }).click();
  await dialog.getByRole('button', { name: 'Greater Broomfield' }).click();
  await expect(
    dialog.getByRole('combobox').locator('option:checked')
  ).toHaveText('Brunner Farmhouse');
});

test('the campaign renders Day 1, switches camera, opens the map and pauses', async ({
  page,
}) => {
  // A fresh software WebGL context compiles the actual scene and loads the Colorado assets.
  test.setTimeout(120_000);
  await page.goto('/');
  await page.getByRole('button', { name: 'Start trip' }).click();
  await expect(page.locator('#counter')).toHaveText('0 / 2', {
    timeout: 90_000,
  });
  await expect(page.locator('#objective-label')).toHaveText('Day 1 · Hunt 1/3');
  await expect(page.locator('#hunt-name')).toHaveText('Terminal West');
  await expect(page.locator('#progress-pips b:visible')).toHaveCount(2);
  await expect(page.locator('#panel')).not.toBeVisible();
  const scene = page.locator('#scene');
  await expect(scene).toBeFocused();
  const frameColors = () => scene.evaluate(async (canvas) => {
    // A canvas stream receives painted frames before WebGL discards the drawing buffer.
    const stream = canvas.captureStream();
    const video = document.createElement('video');
    video.muted = true;
    video.srcObject = stream;
    try {
      await video.play();
      const sample = new OffscreenCanvas(16, 16).getContext('2d');
      sample.drawImage(video, 0, 0, 16, 16);
      const pixels = sample.getImageData(0, 0, 16, 16).data;
      return new Set(new Uint32Array(pixels.buffer)).size;
    } finally {
      stream.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    }
  });
  await expect.poll(frameColors, {
    message: 'Day 1 draws scenery into the WebGL canvas',
    timeout: 30_000,
  }).toBeGreaterThan(1);
  await page.keyboard.press('v');
  await expect(page.locator('#view-name')).toHaveText('Chase cam');
  await page.keyboard.press('m');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Map of the current day')).toBeVisible();
  await dialog.getByRole('button', { name: 'Return to trip' }).click();
  await page.keyboard.press('p');
  await expect(
    dialog.getByRole('heading', { name: 'Hunt paused' })
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Mute audio' }).click();
  await expect(dialog.getByRole('button', { name: 'Enable audio' })).toHaveAttribute('aria-pressed', 'false');
  await dialog.getByRole('button', { name: 'Hunt timer' }).click();
  await expect(page.locator('.clock-box')).toBeHidden();
  await expect(
    dialog.getByRole('button', { name: 'Hunt timer' })
  ).toBeFocused();
  await dialog.getByRole('button', { name: 'Return to lobby' }).click();
  await expect(page.getByRole('button', { name: 'Enable audio' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start trip' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Hunt timer' })
  ).toHaveAttribute('aria-pressed', 'false');
});

test('a failed player model can be retried into a working parade visit', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.route(
    '**/models/bourbon-red.glb',
    (route) => route.fulfill({ status: 503 }),
    { times: 1 }
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Watch parade' }).click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('heading', { name: 'Unable to start' })
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Retry' }).click();
  await expect(page.locator('#counter')).toHaveText('Balloon parade', {
    timeout: 90_000,
  });
  await expect(page.locator('#capture-label')).toBeHidden();
  await expect(page.locator('#progress-pips')).toBeHidden();
  await expect(dialog).toHaveCount(0);
  await page.keyboard.press('m');
  const balloons = dialog.getByRole('combobox', { name: 'WATCH A BALLOON' });
  await expect(balloons.getByRole('option')).toHaveCount(22);
  await balloons.selectOption({ index: 8 });
  await dialog.getByRole('button', { name: 'Rejoin the parade' }).click();
  await expect(page.locator('#scene')).toBeFocused();
  await page.keyboard.press('p');
  await expect(
    dialog.getByRole('heading', { name: 'Parade paused' })
  ).toBeVisible();
});
