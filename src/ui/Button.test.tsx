import { screen } from '@testing-library/react';
import { Plus } from 'lucide-react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Button, LinkButton } from './Button';
import { renderUi, setLanguage } from './testUtils';

beforeEach(async () => {
  await setLanguage('en');
});

describe('Button', () => {
  it('is a plain button by default and calls onClick when tapped', async () => {
    const onClick = vi.fn();
    const { user } = renderUi(<Button onClick={onClick}>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).not.toHaveAttribute('aria-busy');
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('keeps an explicit submit type', () => {
    renderUi(<Button type="submit">Send</Button>);
    expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute('type', 'submit');
  });

  it('while loading: busy, disabled, keeps its label and ignores taps', async () => {
    const onClick = vi.fn();
    const { user, container } = renderUi(
      <Button loading icon={<Plus data-testid="icon" />} onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();
    // The spinner replaces the icon rather than adding to it.
    expect(screen.queryByTestId('icon')).not.toBeInTheDocument();
    expect(container.querySelector('svg.animate-spin')).not.toBeNull();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('when disabled: not busy, not clickable', async () => {
    const onClick = vi.fn();
    const { user } = renderUi(
      <Button disabled variant="danger" size="lg" fullWidth onClick={onClick}>
        Delete
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Delete' });
    expect(button).toBeDisabled();
    expect(button).not.toHaveAttribute('aria-busy');
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('shows a decorative icon that does not change the accessible name', () => {
    renderUi(
      <Button variant="secondary" icon={<Plus />}>
        Add player
      </Button>,
    );
    expect(screen.getByRole('button', { name: 'Add player' })).toBeInTheDocument();
  });

  it('forwards its ref to the native button', () => {
    let node: HTMLButtonElement | null = null;
    renderUi(
      <Button
        variant="ghost"
        ref={(element) => {
          node = element;
        }}
      >
        Ref
      </Button>,
    );
    expect(node).toBeInstanceOf(HTMLButtonElement);
  });
});

describe('LinkButton', () => {
  it('renders a router link that looks like a button', () => {
    renderUi(
      <LinkButton to="/sessions/new" icon={<Plus />} variant="secondary" fullWidth>
        Plan a session
      </LinkButton>,
    );
    const link = screen.getByRole('link', { name: 'Plan a session' });
    expect(link).toHaveAttribute('href', '/sessions/new');
    expect(link.className).toContain('min-h-11');
  });
});
