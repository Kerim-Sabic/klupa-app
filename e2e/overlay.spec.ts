import { expect, test, type Page } from '@playwright/test';
import { requiredEnv } from './support/env';

// Chromium's fake camera shows a moving test pattern with no person in it, so the camera test
// checks the life cycle and what the page sends, not whether players are found. The sample
// clip test below is the one that checks people are found, followed and counted.
test.use({
  permissions: ['camera'],
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
});

declare global {
  interface Window {
    overlayStreams?: MediaStream[];
  }
}

interface Sent {
  readonly url: string;
  readonly method: string;
  readonly hasBody: boolean;
}

/**
 * The one call the app makes that has nothing to do with the overlay: twenty seconds after a
 * page loads it files three page-speed numbers in its own database (docs/PRIVACY.md). CI
 * builds with that switched off; a run on a developer machine may see it, and it is the only
 * request to another address these tests let pass.
 */
const PAGE_SPEED_SAMPLE = `${new URL(requiredEnv('VITE_SUPABASE_URL')).origin}/rest/v1/rpc/report_vitals`;

/** What went over the network, the page-speed sample aside. */
function overNetwork(sent: readonly Sent[]): Sent[] {
  return sent.filter(({ url }) => /^https?:/.test(url) && url !== PAGE_SPEED_SAMPLE);
}

/** Everything the page asks the network for, and every socket it opens, from now on. */
function watchNetwork(page: Page) {
  const sent: Sent[] = [];
  const sockets: string[] = [];
  page.on('request', (request) => {
    sent.push({
      url: request.url(),
      method: request.method(),
      hasBody: request.postData() !== null,
    });
  });
  page.on('websocket', (socket) => {
    sockets.push(socket.url());
  });
  return { sent, sockets };
}

/**
 * The proof behind "nothing is uploaded": while the overlay runs, every request is a plain
 * GET with no body, to this site, for the page's own code, the model or the runtime (and, for
 * the sample, the sample clip). Addresses that never leave the browser (blob:, data:) are
 * the picked video and inline assets.
 */
function expectOnlyOwnFiles(sent: readonly Sent[], origin: string, allowed: RegExp) {
  const network = overNetwork(sent);
  for (const request of network) {
    const url = new URL(request.url);
    expect(request.method, request.url).toBe('GET');
    expect(request.hasBody, request.url).toBe(false);
    expect(url.origin, request.url).toBe(origin);
    expect(url.pathname, request.url).toMatch(allowed);
    expect(url.search, request.url).toBe('');
  }
  return network.map((request) => new URL(request.url).pathname);
}

/**
 * The vision library reports usage counters to its maker once a minute while a task runs and
 * when the task is closed, and it has no switch for that. The page refuses the request
 * (src/lib/usageReports.ts). Leaving the page closes the detector, so this is the moment a
 * report would go: the coach leaves by the link in the header, and still every request the
 * page has made is a plain GET to this site.
 */
async function leaveAndExpectNothingSent(page: Page, sent: readonly Sent[], origin: string) {
  await page.locator('header a[href="/"]').click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'The match, read honestly.' }),
  ).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  for (const request of overNetwork(sent)) {
    expect(new URL(request.url).origin, request.url).toBe(origin);
    expect(request.method, request.url).toBe('GET');
    expect(request.hasBody, request.url).toBe(false);
  }
}

test('the overlay runs on the camera, sends nothing anywhere, and Stop releases the camera', async ({
  page,
  baseURL,
}) => {
  // The model runs on the processor here, a few frames a second: allow it the time.
  test.setTimeout(240_000);
  const origin = new URL(baseURL ?? '').origin;
  await page.addInitScript(() => {
    const devices = navigator.mediaDevices;
    const open = devices.getUserMedia.bind(devices);
    window.overlayStreams = [];
    devices.getUserMedia = async (constraints) => {
      const stream = await open(constraints);
      window.overlayStreams?.push(stream);
      return stream;
    };
  });
  const tracks = () =>
    page.evaluate(() =>
      (window.overlayStreams ?? []).flatMap((s) => s.getTracks().map((t) => t.readyState)),
    );

  await page.goto('/overlay');
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByText(/Nothing is uploaded/)).toBeVisible();
  await expect(page.getByText(/not where they are on the pitch/)).toBeVisible();
  await page.waitForLoadState('networkidle');

  // From the moment the coach asks for the camera, everything the page requests is recorded.
  const { sent, sockets } = watchNetwork(page);
  await page.getByRole('button', { name: 'Use the camera' }).click();
  // The first visit downloads the model before the camera is shown as on.
  await expect(page.getByText('Camera is on')).toBeVisible({ timeout: 90_000 });
  expect(await tracks()).toContain('live');
  // Frames are really being analysed, and keep being analysed for a while.
  await expect(page.getByText(/[1-9]\d* frames? a second analysed/)).toBeVisible({
    timeout: 60_000,
  });
  await page.waitForTimeout(4000);
  await expect(page.getByText(/[1-9]\d* frames? a second analysed/)).toBeVisible();

  const paths = expectOnlyOwnFiles(sent, origin, /^\/(assets|models|vision)\//);
  expect(paths).toContain('/models/efficientdet_lite0.tflite');
  expect(paths.some((path) => path.startsWith('/vision/'))).toBe(true);
  expect(sockets).toEqual([]);

  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByRole('button', { name: 'Use the camera' })).toBeVisible();
  await expect(page.getByText('Camera is on')).toHaveCount(0);
  const after = await tracks();
  expect(after.length).toBeGreaterThan(0);
  expect(after.every((state) => state === 'ended')).toBe(true);

  await leaveAndExpectNothingSent(page, sent, origin);
});

test('on the sample clip, people are found and counted, and each layer can be switched off', async ({
  page,
  baseURL,
}) => {
  // The model runs on the processor here, a few frames a second: allow it the time.
  test.setTimeout(360_000);
  const origin = new URL(baseURL ?? '').origin;
  await page.goto('/overlay');
  await page.getByRole('button', { name: 'English' }).click();
  await page.waitForLoadState('networkidle');

  const { sent, sockets } = watchNetwork(page);
  await page.getByRole('button', { name: 'Try it on a sample clip' }).click();
  await expect(page.getByText('Video is playing')).toBeVisible({ timeout: 90_000 });

  // A player gets a number once seen in three frames; then the counts are no longer all zero.
  const found = async () => {
    const counts = await page.getByTestId('overlay-counts').locator('dd').allTextContents();
    return counts.reduce((sum, text) => sum + Number(text), 0);
  };
  await expect.poll(found, { timeout: 120_000, intervals: [500] }).toBeGreaterThan(0);

  for (const name of ['Rings', 'Numbers', 'Trails']) {
    const layer = page.getByRole('switch', { name });
    await expect(layer).toBeChecked();
    await layer.uncheck({ force: true });
    await expect(layer).not.toBeChecked();
  }
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByText('Paused')).toBeVisible({ timeout: 30_000 });

  const paths = expectOnlyOwnFiles(sent, origin, /^\/(assets|models|vision|data\/overlay)\//);
  expect(paths).toContain('/data/overlay/sample.mp4');
  expect(sockets).toEqual([]);

  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByRole('button', { name: 'Try it on a sample clip' })).toBeVisible();

  await leaveAndExpectNothingSent(page, sent, origin);
});
