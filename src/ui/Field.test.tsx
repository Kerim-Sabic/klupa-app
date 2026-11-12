import { screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SelectField, TextField } from './Field';
import { renderUi, setLanguage } from './testUtils';

beforeEach(async () => {
  await setLanguage('en');
});

describe('TextField', () => {
  it('labels the input and stays valid without an error', () => {
    renderUi(<TextField label="Team name" />);
    const input = screen.getByLabelText('Team name');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('describes the input with its hint', () => {
    renderUi(<TextField label="Shirt number" hint="1 to 99" />);
    expect(screen.getByLabelText('Shirt number')).toHaveAccessibleDescription('1 to 99');
  });

  it('wires the error: invalid, announced, and part of the description after the hint', () => {
    renderUi(<TextField label="Shirt number" hint="1 to 99" error="That number is taken" />);
    const input = screen.getByLabelText('Shirt number');
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('That number is taken');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')?.split(' ')).toContain(alert.id);
    expect(input).toHaveAccessibleDescription('1 to 99 That number is taken');
  });

  it('keeps a caller id and a caller description', () => {
    renderUi(
      <>
        <p id="extra">Shown on the match sheet</p>
        <TextField id="label-field" label="Label" aria-describedby="extra" error="Required" />
      </>,
    );
    const input = screen.getByLabelText('Label');
    expect(input).toHaveAttribute('id', 'label-field');
    expect(input).toHaveAccessibleDescription('Required Shown on the match sheet');
  });

  it('passes native props through and accepts typing', async () => {
    const onChange = vi.fn();
    const { user } = renderUi(
      <TextField label="Note" placeholder="Optional" onChange={onChange} />,
    );
    await user.type(screen.getByPlaceholderText('Optional'), 'ok');
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});

function SelectHarness({ onChange }: { onChange: (value: string) => void }) {
  const [value, setValue] = useState('u10');
  return (
    <SelectField
      label="Age group"
      hint="As registered"
      options={[
        { value: 'u8', label: 'Under 8' },
        { value: 'u10', label: 'Under 10' },
      ]}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

describe('SelectField', () => {
  it('reports the chosen value, not the event', async () => {
    const onChange = vi.fn();
    const { user } = renderUi(<SelectHarness onChange={onChange} />);
    const select = screen.getByRole('combobox', { name: 'Age group' });
    expect(select).toHaveValue('u10');
    expect(select).toHaveAccessibleDescription('As registered');
    await user.selectOptions(select, 'Under 8');
    expect(onChange).toHaveBeenCalledWith('u8');
    expect(select).toHaveValue('u8');
  });

  it('shows its error the same way as a text field', () => {
    renderUi(
      <SelectField
        label="Coach"
        options={[{ value: '', label: 'Choose' }]}
        value=""
        onChange={vi.fn()}
        error="Choose a coach"
      />,
    );
    const select = screen.getByRole('combobox', { name: 'Coach' });
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a coach');
    expect(select).toHaveAccessibleDescription('Choose a coach');
  });
});
