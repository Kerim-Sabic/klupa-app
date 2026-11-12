import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { renderUi, setLanguage } from './testUtils';
import { TOAST_DURATION_MS, ToastProvider, useToast, type ToastInput } from './Toast';

function Trigger({ input }: { input: ToastInput }) {
  const { toast } = useToast();
  return (
    <Button
      onClick={() => {
        toast(input);
      }}
    >
      {`Send ${input.tone}`}
    </Button>
  );
}

function App() {
  return (
    <ToastProvider>
      <Trigger input={{ tone: 'success', message: 'Session saved' }} />
      <Trigger input={{ tone: 'error', message: 'Could not save' }} />
      <Trigger input={{ tone: 'info', message: 'Offline copy' }} />
    </ToastProvider>
  );
}

/** The exit animation runs on real frames; only the dismissal timer is fake. */
async function gone(text: string): Promise<void> {
  await expect.poll(() => screen.queryByText(text)).toBeNull();
}

function regions() {
  const host = screen.getByRole('region', { name: 'Notifications' });
  const lists = host.querySelectorAll('ul');
  const assertive = lists[0];
  const polite = lists[1];
  if (assertive === undefined || polite === undefined) throw new Error('Live regions missing');
  return { assertive, polite };
}

// Driven with fireEvent: user-event awaits real timers through Testing Library's act wrapper.
beforeEach(async () => {
  await setLanguage('en');
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Toast', () => {
  it('has both live regions ready before any message arrives', () => {
    renderUi(<App />);
    const { assertive, polite } = regions();
    expect(assertive).toHaveAttribute('aria-live', 'assertive');
    expect(polite).toHaveAttribute('aria-live', 'polite');
    expect(assertive).toBeEmptyDOMElement();
    expect(polite).toBeEmptyDOMElement();
  });

  it('routes errors to the assertive region and the rest to the polite one', () => {
    renderUi(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Send success' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send error' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send info' }));
    const { assertive, polite } = regions();
    expect(within(assertive).getByText('Could not save')).toBeInTheDocument();
    // The tone is spoken, not only shown by colour and icon.
    expect(within(assertive).getByRole('listitem')).toHaveTextContent('Problem: Could not save');
    expect(within(polite).getAllByRole('listitem')).toHaveLength(2);
    expect(within(polite).getByText('Session saved')).toBeInTheDocument();
  });

  it('dismisses itself after four seconds', async () => {
    renderUi(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Send success' }));
    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS - 1);
    });
    expect(screen.getByText('Session saved')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    await gone('Session saved');
  });

  it('can be dismissed by hand', async () => {
    renderUi(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Send info' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await gone('Offline copy');
  });

  it('waits while the coach is touching or focused on it', async () => {
    renderUi(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Send success' }));
    fireEvent.pointerEnter(screen.getByText('Session saved'));
    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS * 2);
    });
    expect(screen.getByText('Session saved')).toBeInTheDocument();
    fireEvent.pointerLeave(screen.getByText('Session saved'));
    const dismiss = screen.getByRole('button', { name: 'Dismiss' });
    act(() => {
      dismiss.focus();
    });
    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS * 2);
    });
    expect(screen.getByText('Session saved')).toBeInTheDocument();
    act(() => {
      dismiss.blur();
    });
    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS);
    });
    await gone('Session saved');
  });

  it('says clearly when it is used outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Trigger input={{ tone: 'info', message: 'x' }} />)).toThrow(
      /inside <ToastProvider>/,
    );
  });
});
