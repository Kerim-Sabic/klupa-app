import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom does not scroll. The router restores scroll on every navigation, so give it a no-op
// instead of letting each test print "not implemented".
window.scrollTo = () => undefined;

// Vitest globals are off, so Testing Library cannot register its own cleanup.
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
