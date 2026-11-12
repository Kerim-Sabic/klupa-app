import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from './internal';

export interface Column<Row> {
  id: string;
  header: string;
  cell: (row: Row) => ReactNode;
  sortValue?: (row: Row) => number | string | null;
  align?: 'left' | 'right';
}

export type SortDirection = 'asc' | 'desc';

export interface SortState {
  columnId: string;
  direction: SortDirection;
}

export interface DataTableProps<Row> {
  caption: string;
  columns: readonly Column<Row>[];
  rows: readonly Row[];
  getRowId: (row: Row) => string;
  initialSort?: SortState;
  empty?: ReactNode;
}

type SortKey = number | string | null;

function compareKeys(a: SortKey, b: SortKey, collator: Intl.Collator): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return collator.compare(String(a), String(b));
}

/**
 * Sorts a copy of `rows`. Stable, so equal keys keep their given order; `null` (and NaN) is
 * "not measured" and always goes last, whichever way the column is sorted.
 */
export function sortRows<Row>(
  rows: readonly Row[],
  column: Column<Row> | undefined,
  direction: SortDirection,
  collator: Intl.Collator,
): readonly Row[] {
  const sortValue = column?.sortValue;
  if (sortValue === undefined) return rows;
  const sign = direction === 'asc' ? 1 : -1;
  const keyed = rows.map((row) => {
    const key = sortValue(row);
    return { row, key: typeof key === 'number' && Number.isNaN(key) ? null : key };
  });
  keyed.sort((left, right) => {
    if (left.key === null || right.key === null) {
      return Number(left.key === null) - Number(right.key === null);
    }
    return sign * compareKeys(left.key, right.key, collator);
  });
  return keyed.map((entry) => entry.row);
}

const ARIA_SORT = { asc: 'ascending', desc: 'descending' } as const;

function SortGlyph({ direction }: { direction: SortDirection | null }) {
  const Icon = direction === 'asc' ? ArrowUp : direction === 'desc' ? ArrowDown : ChevronsUpDown;
  return (
    <Icon
      aria-hidden="true"
      size={14}
      strokeWidth={2.5}
      className={cx('shrink-0', direction === null && 'opacity-45')}
    />
  );
}

function HeaderCell<Row>({
  column,
  sort,
  onSort,
}: {
  column: Column<Row>;
  sort: SortState | null;
  onSort: (columnId: string) => void;
}) {
  const sortable = column.sortValue !== undefined;
  const direction = sort?.columnId === column.id ? sort.direction : null;
  const right = column.align === 'right';
  return (
    <th
      scope="col"
      aria-sort={direction === null ? undefined : ARIA_SORT[direction]}
      className={cx(
        'sticky top-0 z-10 border-b border-line bg-raised px-3 py-1 text-[13px] font-semibold whitespace-nowrap text-ink-soft',
        right ? 'text-right' : 'text-left',
        // Phone: headers become a row of sort chips; plain headers are carried by each card.
        'max-sm:static max-sm:block max-sm:shrink-0 max-sm:border-0 max-sm:bg-transparent max-sm:p-0',
        !sortable && 'max-sm:hidden',
      )}
    >
      {sortable ? (
        <button
          type="button"
          onClick={() => {
            onSort(column.id);
          }}
          className={cx(
            'inline-flex min-h-11 items-center gap-1 rounded-control px-2 font-semibold',
            'transition-[transform,background-color,color] duration-120 ease-touch hover:bg-mute-soft hover:text-ink active:scale-[0.98]',
            right ? '-mr-2 flex-row-reverse' : '-ml-2',
            direction !== null && 'text-ink',
            'max-sm:mx-0 max-sm:rounded-full max-sm:border max-sm:border-hairline max-sm:bg-raised max-sm:px-3 max-sm:shadow-card max-sm:flex-row',
            direction !== null && 'max-sm:border-ink',
          )}
        >
          {column.header}
          <SortGlyph direction={direction} />
        </button>
      ) : (
        column.header
      )}
    </th>
  );
}

/**
 * A real table with a caption and sortable columns. From 640 px up it is a scrolling table
 * with a sticky header; below that each row is a card with the header beside each value.
 */
export function DataTable<Row>({
  caption,
  columns,
  rows,
  getRowId,
  initialSort,
  empty,
}: DataTableProps<Row>) {
  const { t, i18n } = useTranslation();
  const [sort, setSort] = useState<SortState | null>(initialSort ?? null);
  const collator = useMemo(
    () => new Intl.Collator(i18n.language, { numeric: true, sensitivity: 'base' }),
    [i18n.language],
  );
  const sorted = useMemo(() => {
    if (sort === null) return rows;
    const column = columns.find((candidate) => candidate.id === sort.columnId);
    return sortRows(rows, column, sort.direction, collator);
  }, [rows, columns, sort, collator]);

  function onSort(columnId: string) {
    setSort((current) =>
      current?.columnId === columnId
        ? { columnId, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { columnId, direction: 'asc' },
    );
  }

  return (
    <div className="sm:max-h-[min(70dvh,40rem)] sm:overflow-auto sm:rounded-card sm:border sm:border-hairline sm:bg-raised sm:shadow-card">
      <table className="w-full border-separate border-spacing-0 text-[15px] max-sm:block">
        <caption className="px-3 pt-3 pb-2 text-left text-[13px] font-semibold text-ink-soft max-sm:block max-sm:px-0 max-sm:pt-0">
          {caption}
        </caption>
        <thead className="max-sm:block">
          {/* Phone: one row of sort chips that scrolls sideways, bleeding to the screen edges. */}
          <tr className="max-sm:-mx-4 max-sm:mb-2 max-sm:flex max-sm:gap-2 max-sm:overflow-x-auto max-sm:px-4 max-sm:py-1 max-sm:[scrollbar-width:none]">
            {columns.map((column) => (
              <HeaderCell key={column.id} column={column} sort={sort} onSort={onSort} />
            ))}
          </tr>
        </thead>
        <tbody className="max-sm:flex max-sm:flex-col max-sm:gap-2">
          {sorted.length === 0 ? (
            <tr className="max-sm:block">
              <td
                colSpan={columns.length}
                className="px-3 py-8 text-center text-ink-soft max-sm:block max-sm:rounded-card max-sm:border max-sm:border-dashed max-sm:border-line"
              >
                {empty ?? t('ui.table.empty')}
              </td>
            </tr>
          ) : (
            sorted.map((row) => (
              <tr
                key={getRowId(row)}
                className="transition-colors duration-120 ease-touch sm:hover:bg-paper sm:[&:last-child>td]:border-b-0 max-sm:block max-sm:rounded-card max-sm:border max-sm:border-hairline max-sm:bg-raised max-sm:px-4 max-sm:py-2 max-sm:shadow-card"
              >
                {columns.map((column) => (
                  <td
                    key={column.id}
                    className={cx(
                      'border-b border-line px-3 py-2.5 align-middle',
                      column.align === 'right' ? 'text-right' : 'text-left',
                      'max-sm:flex max-sm:items-baseline max-sm:justify-between max-sm:gap-4 max-sm:border-hairline max-sm:px-0 max-sm:py-2 max-sm:text-right max-sm:last:border-0',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="text-left text-[13px] text-ink-soft sm:hidden"
                    >
                      {column.header}
                    </span>
                    <span className="min-w-0">{column.cell(row)}</span>
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
