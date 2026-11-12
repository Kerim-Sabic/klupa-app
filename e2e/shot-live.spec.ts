import { expect, test } from '@playwright/test';

// Chromium's fake camera shows a moving test pattern with no person in it, so this checks
// the camera's life cycle (on, off, released), not whether a body is tracked.
test.use({
  permissions: ['camera'],
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
});

declare global {
  interface Window {
    liveStreams?: MediaStream[];
  }
}

test('the live camera turns on, and Stop releases it and returns to the start', async ({
  page,
}) => {
  // Remember every stream the page is given, to check afterwards that each was released.
  await page.addInitScript(() => {
    const devices = navigator.mediaDevices;
    const open = devices.getUserMedia.bind(devices);
    window.liveStreams = [];
    devices.getUserMedia = async (constraints) => {
      const stream = await open(constraints);
      window.liveStreams?.push(stream);
      return stream;
    };
  });
  const tracks = () =>
    page.evaluate(() =>
      (window.liveStreams ?? []).flatMap((s) => s.getTracks().map((t) => t.readyState)),
    );

  await page.goto('/shot');
  await page.getByRole('button', { name: 'English' }).click();
  await page.getByRole('button', { name: 'Use the camera live' }).click();
  // The first visit downloads the pose model before the camera is shown as on.
  await expect(page.getByText('Camera is on')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/frames a second analysed/)).toBeVisible();
  expect(await tracks()).toContain('live');

  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByRole('button', { name: 'Use the camera live' })).toBeVisible();
  await expect(page.getByText('Camera is on')).toHaveCount(0);
  const after = await tracks();
  expect(after.length).toBeGreaterThan(0);
  expect(after.every((state) => state === 'ended')).toBe(true);
});
