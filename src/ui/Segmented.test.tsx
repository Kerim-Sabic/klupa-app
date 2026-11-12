import { screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Segmented } from './Segmented';
import { renderUi } from './testUtils';

type Window = '3' | '5' | '10';

const OPTIONS = [
  { value: '3', label: '3 min' },
  { value: '5', label: '5 min' },
  { value: '10', label: '10 min' },
] as const;

function Harness({
  onChange,
  disabled,
}: {
  onChange?: (value: Window) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState<Window>('5');
  return (
    <Segmented<Window>
      label="Chart window"
      options={OPTIONS}
      value={value}
      disabled={disabled ?? false}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

function radio(name: string): HTMLElement {
  return screen.getByRole('radio', { name });
}

describe('Segmented', () => {
  it('is a labelled radio group with one checked option and one tab stop', () => {
    renderUi(<Harness />);
    expect(screen.getByRole('radiogroup', { name: 'Chart window' })).toBeInTheDocument();
    expect(radio('5 min')).toHaveAttribute('aria-checked', 'true');
    expect(radio('3 min')).toHaveAttribute('aria-checked', 'false');
    expect(radio('5 min')).toHaveAttribute('tabindex', '0');
    expect(radio('3 min')).toHaveAttribute('tabindex', '-1');
    expect(radio('10 min')).toHaveAttribute('tabindex', '-1');
  });

  it('tabs into the selected option', async () => {
    const { user } = renderUi(<Harness />);
    await user.tab();
    expect(radio('5 min')).toHaveFocus();
  });

  it('moves and selects with the arrow keys, wrapping at both ends', async () => {
    const onChange = vi.fn();
    const { user } = renderUi(<Harness onChange={onChange} />);
    await user.click(radio('5 min'));
    expect(onChange).not.toHaveBeenCalled();

    await user.keyboard('{ArrowRight}');
    expect(radio('10 min')).toHaveFocus();
    expect(radio('10 min')).toHaveAttribute('aria-checked', 'true');

    await user.keyboard('{ArrowDown}');
    expect(radio('3 min')).toHaveFocus();
    expect(radio('3 min')).toHaveAttribute('aria-checked', 'true');

    await user.keyboard('{ArrowLeft}');
    expect(radio('10 min')).toHaveAttribute('aria-checked', 'true');

    await user.keyboard('{ArrowUp}');
    expect(radio('5 min')).toHaveAttribute('aria-checked', 'true');
    expect(onChange.mock.calls.map(([value]: unknown[]) => value)).toEqual(['10', '3', '10', '5']);
  });

  it('jumps to the ends with Home and End and ignores other keys', async () => {
    const { user } = renderUi(<Harness />);
    await user.click(radio('5 min'));
    await user.keyboard('{End}');
    expect(radio('10 min')).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('{Home}');
    expect(radio('3 min')).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('x');
    expect(radio('3 min')).toHaveAttribute('aria-checked', 'true');
  });

  it('selects on click', async () => {
    const { user } = renderUi(<Harness />);
    await user.click(radio('3 min'));
    expect(radio('3 min')).toHaveAttribute('aria-checked', 'true');
    expect(radio('3 min')).toHaveAttribute('tabindex', '0');
  });

  it('keeps the group reachable when the value matches no option', () => {
    renderUi(
      <Segmented<Window>
        label="Window"
        options={OPTIONS}
        value={'15' as Window}
        onChange={vi.fn()}
      />,
    );
    expect(radio('3 min')).toHaveAttribute('tabindex', '0');
  });

  it('can be disabled as a whole', async () => {
    const onChange = vi.fn();
    const { user } = renderUi(<Harness disabled onChange={onChange} />);
    expect(screen.getByRole('radiogroup')).toHaveAttribute('aria-disabled', 'true');
    await user.click(radio('3 min'));
    expect(onChange).not.toHaveBeenCalled();
    expect(radio('3 min')).toBeDisabled();
  });
});
