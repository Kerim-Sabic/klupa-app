import { screen } from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Stat } from './Stat';
import { renderUi, setLanguage } from './testUtils';

beforeEach(async () => {
  await setLanguage('en');
});

afterEach(() => {
  MotionGlobalConfig.skipAnimations = true;
});

/** The copy assistive tech reads: present from the first render, never mid-count. */
function announced(text: string): HTMLElement {
  const match = screen.getAllByText(text).find((node) => node.className.includes('sr-only'));
  if (match === undefined) throw new Error(`No announced value "${text}"`);
  return match;
}

describe('Stat', () => {
  it('has the final value in the DOM on the first render, even while counting', () => {
    MotionGlobalConfig.skipAnimations = false;
    renderUi(<Stat label="Minutes played" value={1240} hint="This season" />);
    expect(screen.getByText('Minutes played')).toBeInTheDocument();
    expect(announced('1,240')).toBeInTheDocument();
    expect(screen.getByText('This season')).toBeInTheDocument();
  });

  it('settles the visible number on the final value', async () => {
    const { container } = renderUi(<Stat label="Chances" value={12} tone="pitch" />);
    const visible = container.querySelector('[aria-hidden="true"]');
    await expect.poll(() => visible?.textContent).toBe('12');
  });

  it('shows the true number at once when the page is hidden and cannot animate', () => {
    MotionGlobalConfig.skipAnimations = false;
    const hidden = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const { container } = renderUi(<Stat label="Matches" value={1941} />);
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe('1,941');
    hidden.mockRestore();
  });

  it('never leaves a stalled count on screen: it settles by timer', async () => {
    MotionGlobalConfig.skipAnimations = false;
    // No animation frame ever fires, as in a throttled or backgrounded page.
    const stalled = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
    const { container } = renderUi(<Stat label="Matches" value={1941} />);
    const visible = container.querySelector('[aria-hidden="true"]');
    await expect.poll(() => visible?.textContent, { timeout: 2000 }).toBe('1,941');
    stalled.mockRestore();
  });

  it('keeps as many decimals as the value has, in the reader’s language', async () => {
    await setLanguage('bs');
    renderUi(<Stat label="xG" value={1.25} tone="amber" />);
    expect(announced('1,25')).toBeInTheDocument();
  });

  it('uses a custom format for both copies', async () => {
    const { container } = renderUi(
      <Stat
        label="Share"
        value={0.42}
        tone="clay"
        format={(value) => `${String(Math.round(value * 100))}%`}
      />,
    );
    expect(announced('42%')).toBeInTheDocument();
    const visible = container.querySelector('[aria-hidden="true"]');
    await expect.poll(() => visible?.textContent).toBe('42%');
  });

  it('announces a new value at once when it changes', async () => {
    const { rerender, container } = renderUi(<Stat label="Goals" value={2} />);
    rerender(<Stat label="Goals" value={3} />);
    expect(announced('3')).toBeInTheDocument();
    const visible = container.querySelector('[aria-hidden="true"]');
    await expect.poll(() => visible?.textContent).toBe('3');
  });
});
