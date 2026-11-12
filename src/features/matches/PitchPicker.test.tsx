import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import type { PitchLocation } from './pitch';
import { VIEW } from './pitch';
import { PitchPicker } from './PitchPicker';
import { Scoreboard, SyncChip } from './Scoreboard';

function Harness({ onChange }: { onChange: (location: PitchLocation) => void }) {
  const [location, setLocation] = useState<PitchLocation | null>(null);
  return (
    <PitchPicker
      location={location}
      onChange={(next) => {
        setLocation(next);
        onChange(next);
      }}
    />
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

describe('PitchPicker', () => {
  it('converts a tap on the drawing to the stored x and y', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const pitch = screen.getByRole('button', { name: /Attacking half/ });
    const svg = pitch.querySelector('svg');
    if (svg === null) throw new Error('The pitch drawing is missing.');
    // Drawn at double size, 30 px from the left and 50 px from the top of the page.
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      left: 30,
      top: 50,
      width: VIEW.width * 2,
      height: VIEW.height * 2,
    } as DOMRect);
    // A point a quarter of the way across, on the edge of the penalty area (16.5 m out).
    fireEvent.click(pitch, {
      clientX: 30 + (170 - VIEW.x) * 2,
      clientY: 50 + (165 - VIEW.y) * 2,
      detail: 1,
    });
    expect(onChange).toHaveBeenLastCalledWith({ x: 84, y: 25 });
    expect(screen.getByTestId('pitch-marker')).toBeInTheDocument();
    expect(screen.getByText('About 24 m from goal.')).toBeInTheDocument();
  });

  it('places the marker on the penalty spot from the keyboard, then nudges it', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);
    const pitch = screen.getByRole('button', { name: /Attacking half/ });
    pitch.focus();
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenLastCalledWith({ x: 90, y: 50 });
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledTimes(1);
    await user.keyboard('{ArrowDown}{ArrowLeft}');
    expect(onChange).toHaveBeenLastCalledWith({ x: 89, y: 49 });
    await user.keyboard('a');
    expect(onChange).toHaveBeenCalledTimes(3);
  });
});

describe('Scoreboard', () => {
  it('names periods by halves for two periods and by number otherwise', () => {
    const props = {
      opponent: 'Sloga',
      score: { home: 2, away: 1 },
      period: 3,
      phase: 'running' as const,
      seconds: 125,
      waiting: 0,
      online: true,
    };
    const { rerender } = render(<Scoreboard {...props} periodCount={4} />);
    expect(screen.getByText('Period 3')).toBeInTheDocument();
    expect(screen.getByRole('timer', { name: 'Match clock' })).toHaveTextContent('02:05');
    expect(screen.getByText('Us 2, Sloga 1')).toBeInTheDocument();
    rerender(<Scoreboard {...props} period={2} periodCount={2} />);
    expect(screen.getByText('Half 2')).toBeInTheDocument();
  });

  it('says whether everything reached the server', () => {
    const { rerender } = render(<SyncChip waiting={0} online />);
    expect(screen.getByText('All saved')).toBeInTheDocument();
    rerender(<SyncChip waiting={3} online />);
    expect(screen.getByText('Waiting to send: 3')).toBeInTheDocument();
    rerender(<SyncChip waiting={0} online={false} />);
    expect(screen.getByText('Offline')).toBeInTheDocument();
    rerender(<SyncChip waiting={2} online={false} />);
    expect(screen.getByText('Offline, waiting to send: 2')).toBeInTheDocument();
  });
});
