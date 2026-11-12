import { render, type RenderOptions } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionConfig, MotionGlobalConfig } from 'motion/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import i18n from '../i18n';
import bsUi from '../i18n/locales/bs/ui.json';
import enUi from '../i18n/locales/en/ui.json';

// The app loader merges every locales/<lang>/*.json; register ours too in case it does not.
for (const [language, bundle] of [
  ['bs', bsUi],
  ['en', enUi],
] as const) {
  if (!i18n.exists('ui.close', { lng: language })) {
    i18n.addResourceBundle(language, 'translation', bundle, true, true);
  }
}

// Tests check behaviour and end states, not tweens: finish every motion animation at once.
MotionGlobalConfig.skipAnimations = true;

export async function setLanguage(language: 'bs' | 'en'): Promise<void> {
  await i18n.changeLanguage(language);
}

function Providers({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </MemoryRouter>
  );
}

/** Render inside the providers the app root supplies, with a ready userEvent instance. */
export function renderUi(ui: ReactElement, options: Omit<RenderOptions, 'wrapper'> = {}) {
  const user = userEvent.setup();
  return { user, ...render(ui, { wrapper: Providers, ...options }) };
}
