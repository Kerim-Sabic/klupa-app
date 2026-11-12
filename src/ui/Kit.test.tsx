import { screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Footprints } from 'lucide-react';
import { beforeEach, describe, expect, it } from 'vitest';
import { Avatar } from './Avatar';
import { LargeTitle } from './LargeTitle';
import { ListGroup, ListRow } from './ListRow';
import { KlupaMark, MARK_STROKES } from './Mark';
import { SectionHeader } from './SectionHeader';
import { renderUi, setLanguage } from './testUtils';

beforeEach(async () => {
  await setLanguage('en');
});

describe('LargeTitle', () => {
  it('is the page heading, with its eyebrow, subtitle and actions', () => {
    renderUi(
      <LargeTitle
        eyebrow="Wed 11 Nov"
        title="Today"
        subtitle="U13 · FK Primjer"
        actions={<button type="button">Record</button>}
      />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument();
    expect(screen.getByText('Wed 11 Nov')).toBeInTheDocument();
    expect(screen.getByText('U13 · FK Primjer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record' })).toBeInTheDocument();
  });
});

describe('SectionHeader', () => {
  it('titles a section at the level asked for, with an optional link', () => {
    renderUi(
      <SectionHeader
        as="h3"
        id="labs"
        title="Labs"
        detail="Experiments"
        action={{ to: '/labs', label: 'See all' }}
      />,
    );
    expect(screen.getByRole('heading', { level: 3, name: 'Labs' })).toHaveAttribute('id', 'labs');
    expect(screen.getByText('Experiments')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See all' })).toHaveAttribute('href', '/labs');
  });

  it('defaults to an h2 without a link', () => {
    renderUi(<SectionHeader title="Last match" />);
    expect(screen.getByRole('heading', { level: 2, name: 'Last match' })).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('ListRow', () => {
  it('makes the whole row one link inside a named list', () => {
    renderUi(
      <ListGroup label="Labs">
        <ListRow
          to="/movement"
          icon={<Footprints />}
          tone="seen"
          title="Movement lab"
          detail="Read movement from video"
          value="New"
        />
        <ListRow title="Plain row" />
      </ListGroup>,
    );
    const list = screen.getByRole('list', { name: 'Labs' });
    expect(list.children).toHaveLength(2);
    const link = screen.getByRole('link', { name: /Movement lab.*Read movement from video.*New/ });
    expect(link).toHaveAttribute('href', '/movement');
    expect(screen.getByText('Plain row').closest('a')).toBeNull();
  });

  it('takes an explicit name when the title alone is ambiguous', () => {
    renderUi(
      <ListGroup labelledBy="x">
        <ListRow to="/a" title="Open" label="Open the squad" />
      </ListGroup>,
    );
    expect(screen.getByRole('link', { name: 'Open the squad' })).toBeInTheDocument();
  });
});

describe('Avatar', () => {
  it('shows the shirt number and is decorative unless it is given a name', () => {
    const { container, rerender } = renderUi(<Avatar number={7} />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(container).toHaveTextContent('7');
    rerender(<Avatar number={11} size="lg" label="Player 11" />);
    expect(screen.getByRole('img', { name: 'Player 11' })).toHaveTextContent('11');
  });
});

describe('KlupaMark', () => {
  it('is decorative next to the word, or an image when it stands alone', () => {
    const { container, rerender } = renderUi(<KlupaMark />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    rerender(<KlupaMark title="Klupa" size={40} />);
    expect(screen.getByRole('img', { name: 'Klupa' })).toHaveAttribute('width', '40');
  });

  it('draws the same bench as the app icons', () => {
    for (const file of ['icon.svg', 'icon-maskable.svg']) {
      const svg = readFileSync(join(process.cwd(), 'public', 'icons', file), 'utf8');
      const paths = [...svg.matchAll(/<path d="([^"]+)" stroke-width="([\d.]+)"/g)].map(
        (found) => ({ d: found[1], width: Number(found[2]) }),
      );
      expect(paths, file).toEqual(MARK_STROKES.map((stroke) => ({ ...stroke })));
    }
  });
});
