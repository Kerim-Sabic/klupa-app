import type { Page } from '@playwright/test';

export interface PageWatch {
  /** Console errors, uncaught exceptions and failed or 4xx/5xx same-origin requests. */
  readonly problems: string[];
}

/**
 * Collects everything that would make a coach's page misbehave silently. The backend is a
 * different origin, so only its console errors count, not its status codes.
 */
export function watchPage(page: Page, origin: string): PageWatch {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => {
    problems.push(`exception: ${error.message}`);
  });
  page.on('requestfailed', (request) => {
    if (request.url().startsWith(origin)) {
      problems.push(`failed request: ${request.url()} (${request.failure()?.errorText ?? '?'})`);
    }
  });
  page.on('response', (response) => {
    if (response.url().startsWith(origin) && response.status() >= 400) {
      problems.push(`HTTP ${String(response.status())}: ${response.url()}`);
    }
  });
  return { problems };
}
