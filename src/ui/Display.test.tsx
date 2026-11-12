import { screen } from '@testing-library/react';
import { Inbox } from 'lucide-react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { Card, CardTitle } from './Card';
import { EmptyState, ErrorNotice } from './Feedback';
import { PageHeader } from './PageHeader';
import { Reveal, RevealList } from './Reveal';
import { Skeleton, SkeletonText } from './Skeleton';
import { Spinner } from './Spinner';
import { renderUi, setLanguage } from './testUtils';

beforeEach(async () => {
  await setLanguage('en');
});

describe('Card', () => {
  it('renders as the element asked for, with its title and extra attributes', () => {
    renderUi(
      <ul>
        <Card as="li" interactive padded={false} aria-label="Match 3" className="extra">
          <CardTitle as="h3">Match 3</CardTitle>
        </Card>
      </ul>,
    );
    const item = screen.getByRole('listitem', { name: 'Match 3' });
    expect(item).toHaveClass('extra');
    expect(screen.getByRole('heading', { level: 3, name: 'Match 3' })).toBeInTheDocument();
  });

  it('defaults to a padded div with an h2 title', () => {
    const { container } = renderUi(
      <Card>
        <CardTitle>Squad</CardTitle>
      </Card>,
    );
    expect(container.firstElementChild?.tagName).toBe('DIV');
    expect(screen.getByRole('heading', { level: 2, name: 'Squad' })).toBeInTheDocument();
  });
});

describe('PageHeader', () => {
  it('gives the page its one h1, a way back and its actions', () => {
    renderUi(
      <PageHeader
        title="Sessions"
        subtitle="Plans that fit your group"
        back={{ to: '/team', label: 'Team' }}
        actions={<Button>New</Button>}
      />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Sessions' })).toBeInTheDocument();
    expect(screen.getByText('Plans that fit your group')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Team' })).toHaveAttribute('href', '/team');
    expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument();
  });

  it('can be just a title', () => {
    renderUi(<PageHeader title="Klupa" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Klupa');
  });
});

describe('EmptyState', () => {
  it('says what is missing and what to do next', () => {
    renderUi(
      <EmptyState
        icon={<Inbox />}
        title="No matches yet"
        body="Record your first match to see who had the initiative."
        action={<Button>Record a match</Button>}
      />,
    );
    expect(screen.getByText('No matches yet')).toBeInTheDocument();
    expect(screen.getByText(/Record your first match/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record a match' })).toBeInTheDocument();
  });

  it('works with a title alone', () => {
    const { container } = renderUi(<EmptyState title="Nothing here" />);
    expect(container.querySelector('svg')).toBeNull();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('ErrorNotice', () => {
  it('is announced and offers a retry', async () => {
    const onRetry = vi.fn();
    const { user } = renderUi(
      <ErrorNotice
        title="Could not load the squad"
        body="Check your connection."
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load the squad');
    expect(screen.getByText('Check your connection.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('offers no retry when none can help, in Bosnian too', async () => {
    await setLanguage('bs');
    renderUi(<ErrorNotice title="Nije uspjelo" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Nije uspjelo');
    expect(screen.queryByRole('button', { name: 'Pokušajte ponovo' })).not.toBeInTheDocument();
  });
});

describe('Spinner and skeletons', () => {
  it('announces loading with a translated default label', async () => {
    const { rerender } = renderUi(<Spinner />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    rerender(<Spinner label="Loading the squad" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading the squad');
    await setLanguage('bs');
    rerender(<Spinner />);
    expect(screen.getByRole('status')).toHaveTextContent('Učitava se');
  });

  it('keeps skeletons out of the accessibility tree', () => {
    const { container } = renderUi(
      <>
        <Skeleton />
        <Skeleton className="h-20 w-full" />
        <SkeletonText />
        <SkeletonText lines={1} />
      </>,
    );
    const roots = [...container.children];
    expect(roots).toHaveLength(4);
    for (const root of roots) expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(roots[1]).toHaveClass('h-20');
    expect(roots[2]?.children).toHaveLength(3);
    expect(roots[3]?.children).toHaveLength(1);
  });
});

describe('Reveal', () => {
  it('shows its content', async () => {
    renderUi(
      <Reveal delay={60}>
        <p>Half one</p>
      </Reveal>,
    );
    const wrapper = screen.getByText('Half one').parentElement;
    await expect.poll(() => wrapper?.style.opacity).toBe('1');
    expect(screen.getByText('Half one')).toBeVisible();
  });

  it('keeps list semantics and ends with every item visible', async () => {
    const items = Array.from({ length: 10 }, (_, index) => `Drill ${String(index + 1)}`);
    renderUi(
      <RevealList as="ul" className="grid gap-2">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </RevealList>,
    );
    const list = screen.getByRole('list');
    expect(list).toHaveClass('grid');
    expect(screen.getAllByRole('listitem')).toHaveLength(10);
    const last = screen.getByText('Drill 10');
    await expect.poll(() => last.style.opacity).toBe('1');
  });

  it('defaults to a div', () => {
    const { container } = renderUi(
      <RevealList>
        <p>One</p>
      </RevealList>,
    );
    expect(container.firstElementChild?.tagName).toBe('DIV');
  });
});
