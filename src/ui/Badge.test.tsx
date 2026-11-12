import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MOMENTUM_STATES, type MomentumState } from '../engine';
import { Pill, StateBadge } from './Badge';
import { renderUi, setLanguage } from './testUtils';

const LABELS: Record<'en' | 'bs', Record<MomentumState, string>> = {
  en: {
    stable: 'Stable',
    'event-sensitive': 'Depends on one chance',
    'window-sensitive': 'Depends on the window',
    level: 'Level',
    insufficient: 'Not enough evidence',
  },
  bs: {
    stable: 'Stabilno',
    'event-sensitive': 'Zavisi od jedne šanse',
    'window-sensitive': 'Zavisi od perioda',
    level: 'Ravnopravno',
    insufficient: 'Nema dovoljno dokaza',
  },
};

describe('StateBadge', () => {
  for (const language of ['en', 'bs'] as const) {
    it.each(MOMENTUM_STATES)(`says the ${language} label for %s, with an icon`, async (state) => {
      await setLanguage(language);
      const { container } = renderUi(<StateBadge state={state} size="sm" />);
      expect(screen.getByText(LABELS[language][state])).toBeInTheDocument();
      // Never colour alone: every state also carries a (decorative) icon.
      const icon = container.querySelector('svg');
      expect(icon).not.toBeNull();
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });
  }

  it('gives every state its own icon', async () => {
    await setLanguage('en');
    const { container } = renderUi(
      <>
        {MOMENTUM_STATES.map((state) => (
          <StateBadge key={state} state={state} />
        ))}
      </>,
    );
    const icons = [...container.querySelectorAll('svg')].map((svg) => svg.getAttribute('class'));
    expect(new Set(icons).size).toBe(MOMENTUM_STATES.length);
  });
});

describe('Pill', () => {
  it.each(['pitch', 'amber', 'clay', 'mute', 'ink'] as const)(
    'shows its words in the %s tone',
    (tone) => {
      renderUi(<Pill tone={tone}>Estimate</Pill>);
      expect(screen.getByText('Estimate')).toBeInTheDocument();
    },
  );
});
