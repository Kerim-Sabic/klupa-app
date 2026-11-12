import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import type { FeedEvent } from './feed';
import { LastEventStrip } from './LastEventStrip';

const event: FeedEvent = {
  id: 'event-1',
  client_id: 'client-1',
  period: 1,
  clock_seconds: 754,
  side: 'away',
  kind: 'corner',
  weight: 250,
  x: null,
  y: null,
  header: false,
  match_id: 'match-1',
  deleted_at: null,
  created_at: '2026-11-11T18:00:00Z',
  sync: 'saved',
};

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

describe('LastEventStrip', () => {
  it('holds its place with a hint before the first event', () => {
    render(<LastEventStrip event={undefined} canUndo onUndo={vi.fn()} />);
    expect(screen.getByText('Tap a button when something happens.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the newest event and undoes it in one tap', async () => {
    const onUndo = vi.fn();
    render(<LastEventStrip event={event} canUndo onUndo={onUndo} />);
    expect(screen.getByText('12:34')).toBeInTheDocument();
    expect(screen.getByText(/Corner/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Undo the last event' }));
    expect(onUndo).toHaveBeenCalledWith(event);
  });

  it('offers no undo once the match is finished', () => {
    render(<LastEventStrip event={event} canUndo={false} onUndo={vi.fn()} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
