import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { DataTable, sortRows, type Column } from './DataTable';
import { renderUi, setLanguage } from './testUtils';

interface Player {
  id: string;
  label: string;
  minutes: number | null;
}

const PLAYERS: readonly Player[] = [
  { id: 'p1', label: 'Player 10', minutes: 40 },
  { id: 'p2', label: 'Player 2', minutes: null },
  { id: 'p3', label: 'Player 7', minutes: 55 },
  { id: 'p4', label: 'Player 1', minutes: 12 },
];

const COLUMNS: readonly Column<Player>[] = [
  { id: 'label', header: 'Player', cell: (row) => row.label, sortValue: (row) => row.label },
  {
    id: 'minutes',
    header: 'Minutes',
    align: 'right',
    cell: (row) => (row.minutes === null ? 'Not recorded' : String(row.minutes)),
    sortValue: (row) => row.minutes,
  },
  { id: 'note', header: 'Note', cell: () => '-' },
];

function firstColumn(): string[] {
  const body = screen.getAllByRole('rowgroup')[1];
  if (body === undefined) throw new Error('No table body');
  return within(body)
    .getAllByRole('row')
    .map((row) => within(row).getAllByRole('cell')[0]?.lastElementChild?.textContent ?? '');
}

function header(name: string): HTMLElement {
  return screen.getByRole('columnheader', { name });
}

beforeEach(async () => {
  await setLanguage('en');
});

describe('DataTable', () => {
  it('is a real table with a caption and rows in the given order', () => {
    renderUi(
      <DataTable
        caption="Minutes this season"
        columns={COLUMNS}
        rows={PLAYERS}
        getRowId={(row) => row.id}
      />,
    );
    expect(screen.getByRole('table', { name: 'Minutes this season' })).toBeInTheDocument();
    expect(firstColumn()).toEqual(['Player 10', 'Player 2', 'Player 7', 'Player 1']);
    for (const name of ['Player', 'Minutes', 'Note']) {
      expect(header(name)).not.toHaveAttribute('aria-sort');
    }
  });

  it('only offers sorting on sortable columns', () => {
    renderUi(
      <DataTable caption="Squad" columns={COLUMNS} rows={PLAYERS} getRowId={(row) => row.id} />,
    );
    expect(within(header('Player')).getByRole('button', { name: 'Player' })).toBeInTheDocument();
    expect(within(header('Note')).queryByRole('button')).not.toBeInTheDocument();
  });

  it('sorts by a header, toggles direction, and always keeps nulls last', async () => {
    const { user } = renderUi(
      <DataTable caption="Squad" columns={COLUMNS} rows={PLAYERS} getRowId={(row) => row.id} />,
    );
    await user.click(screen.getByRole('button', { name: 'Minutes' }));
    expect(header('Minutes')).toHaveAttribute('aria-sort', 'ascending');
    expect(firstColumn()).toEqual(['Player 1', 'Player 10', 'Player 7', 'Player 2']);

    await user.click(screen.getByRole('button', { name: 'Minutes' }));
    expect(header('Minutes')).toHaveAttribute('aria-sort', 'descending');
    expect(firstColumn()).toEqual(['Player 7', 'Player 10', 'Player 1', 'Player 2']);
  });

  it('moves the sort to another column, ascending, with natural text order', async () => {
    const { user } = renderUi(
      <DataTable
        caption="Squad"
        columns={COLUMNS}
        rows={PLAYERS}
        getRowId={(row) => row.id}
        initialSort={{ columnId: 'minutes', direction: 'desc' }}
      />,
    );
    expect(header('Minutes')).toHaveAttribute('aria-sort', 'descending');
    await user.click(screen.getByRole('button', { name: 'Player' }));
    expect(header('Player')).toHaveAttribute('aria-sort', 'ascending');
    expect(header('Minutes')).not.toHaveAttribute('aria-sort');
    // "Player 2" before "Player 10": numbers inside text sort as numbers.
    expect(firstColumn()).toEqual(['Player 1', 'Player 2', 'Player 7', 'Player 10']);
  });

  it('shows the empty message in the table, translated by default', async () => {
    const { rerender } = renderUi(
      <DataTable caption="Squad" columns={COLUMNS} rows={[]} getRowId={(row) => row.id} />,
    );
    expect(screen.getByRole('cell', { name: 'Nothing to show yet.' })).toHaveAttribute(
      'colspan',
      '3',
    );
    await setLanguage('bs');
    rerender(
      <DataTable
        caption="Squad"
        columns={COLUMNS}
        rows={[]}
        getRowId={(row) => row.id}
        empty="Dodajte igrače"
      />,
    );
    expect(screen.getByRole('cell', { name: 'Dodajte igrače' })).toBeInTheDocument();
  });
});

describe('sortRows', () => {
  const collator = new Intl.Collator('en', { numeric: true });
  const column = COLUMNS[1];

  it('treats NaN as missing and keeps equal keys in their given order', () => {
    const rows: Player[] = [
      { id: 'a', label: 'A', minutes: Number.NaN },
      { id: 'b', label: 'B', minutes: 5 },
      { id: 'c', label: 'C', minutes: null },
      { id: 'd', label: 'D', minutes: 5 },
    ];
    expect(sortRows(rows, column, 'asc', collator).map((row) => row.id)).toEqual([
      'b',
      'd',
      'a',
      'c',
    ]);
    expect(sortRows(rows, column, 'desc', collator).map((row) => row.id)).toEqual([
      'b',
      'd',
      'a',
      'c',
    ]);
  });

  it('leaves rows alone for an unknown or unsortable column', () => {
    expect(sortRows(PLAYERS, undefined, 'asc', collator)).toBe(PLAYERS);
    expect(sortRows(PLAYERS, COLUMNS[2], 'asc', collator)).toBe(PLAYERS);
  });

  it('compares mixed numbers and text as text', () => {
    const mixed: Column<{ id: string; key: number | string }> = {
      id: 'k',
      header: 'K',
      cell: (row) => row.id,
      sortValue: (row) => row.key,
    };
    const rows = [
      { id: 'x', key: 'b' },
      { id: 'y', key: 3 },
      { id: 'z', key: 'a' },
    ];
    expect(sortRows(rows, mixed, 'asc', collator).map((row) => row.id)).toEqual(['y', 'z', 'x']);
  });
});
