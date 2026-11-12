import { useEffect, useState } from 'react';

export interface TokenColors {
  readonly ink: string;
  readonly inkSoft: string;
  readonly line: string;
  readonly pitch: string;
  readonly amber: string;
  readonly clay: string;
  readonly raised: string;
  readonly paper: string;
  readonly home: string;
}

const NAMES: Readonly<Record<keyof TokenColors, string>> = {
  ink: '--color-ink',
  inkSoft: '--color-ink-soft',
  line: '--color-line',
  pitch: '--color-pitch',
  amber: '--color-amber',
  clay: '--color-clay',
  raised: '--color-raised',
  paper: '--color-paper',
  home: '--color-home',
};

// Light-theme values from docs/DESIGN.md: used only if the stylesheet is not there (tests).
const FALLBACK: TokenColors = {
  ink: '#12161c',
  inkSoft: '#4a5361',
  line: '#e3ded3',
  pitch: '#0f6b46',
  amber: '#b86e00',
  clay: '#b93a26',
  raised: '#ffffff',
  paper: '#f7f4ee',
  home: '#1d4ed8',
};

function read(): TokenColors {
  const style = getComputedStyle(document.documentElement);
  const pick = (key: keyof TokenColors): string =>
    style.getPropertyValue(NAMES[key]).trim() || FALLBACK[key];
  return {
    ink: pick('ink'),
    inkSoft: pick('inkSoft'),
    line: pick('line'),
    pitch: pick('pitch'),
    amber: pick('amber'),
    clay: pick('clay'),
    raised: pick('raised'),
    paper: pick('paper'),
    home: pick('home'),
  };
}

/**
 * The design tokens as concrete colours for canvas and WebGL, which cannot read CSS
 * variables themselves. Re-read when the system switches between light and dark.
 */
export function useTokens(): TokenColors {
  const [colors, setColors] = useState<TokenColors>(read);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => {
      setColors(read());
    };
    query.addEventListener('change', update);
    return () => {
      query.removeEventListener('change', update);
    };
  }, []);
  return colors;
}
