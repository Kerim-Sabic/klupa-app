import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n, { messages } from '../../i18n';
import { scoreLine, teamLabel } from './text';

interface IndexFile {
  readonly matches: readonly { readonly home: string; readonly away: string }[];
}

const index = JSON.parse(readFileSync('public/data/pro/index.json', 'utf8')) as IndexFile;
const teamsInData = [...new Set(index.matches.flatMap((match) => [match.home, match.away]))];

function teamNames(language: 'bs' | 'en'): Record<string, string> {
  const pro = messages[language].pro as { team: Record<string, string> };
  return pro.team;
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

describe('team names', () => {
  it('reads a team in the language of the page', async () => {
    expect(teamLabel(i18n.t, 'Croatia')).toBe('Croatia');
    await i18n.changeLanguage('bs');
    expect(teamLabel(i18n.t, 'Croatia')).toBe('Hrvatska');
    expect(teamLabel(i18n.t, 'Korea Republic')).toBe('Južna Koreja');
  });

  it('falls back to the name in the data for a team it has never heard of', async () => {
    await i18n.changeLanguage('bs');
    expect(teamLabel(i18n.t, 'Atlantis')).toBe('Atlantis');
  });

  it('writes the score line with the names the reader sees', async () => {
    const match: Parameters<typeof scoreLine>[1] = {
      home: 'France',
      away: 'Croatia',
      score: [4, 2],
    };
    expect(scoreLine(i18n.t, match)).toBe('France 4–2 Croatia');
    await i18n.changeLanguage('bs');
    expect(scoreLine(i18n.t, match)).toBe('Francuska 4–2 Hrvatska');
  });

  it('has a name in both languages for every team in the bundled matches, and no others', () => {
    expect(teamsInData.length).toBeGreaterThan(40);
    for (const language of ['en', 'bs'] as const) {
      expect(Object.keys(teamNames(language)).sort()).toEqual([...teamsInData].sort());
    }
    // English keeps the data's own spelling.
    for (const team of teamsInData) expect(teamNames('en')[team]).toBe(team);
  });
});
