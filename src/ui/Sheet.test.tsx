import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { Sheet } from './Sheet';
import { renderUi, setLanguage } from './testUtils';

beforeEach(async () => {
  await setLanguage('en');
});

function Harness({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
        }}
      >
        Add player
      </Button>
      <Sheet
        open={open}
        title="New player"
        onClose={() => {
          setOpen(false);
          onClose?.();
        }}
        footer={<Button>Save</Button>}
      >
        <p>Label and shirt number only.</p>
      </Sheet>
    </>
  );
}

describe('Sheet', () => {
  it('is closed and out of the accessibility tree until opened', () => {
    renderUi(<Harness />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens as a labelled dialog with focus on its close button', async () => {
    const { user } = renderUi(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Add player' }));
    const dialog = screen.getByRole('dialog', { name: 'New player' });
    expect(dialog).toHaveAttribute('open');
    expect(screen.getByText('Label and shirt number only.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  });

  it('closes from the close button and returns focus to the opener', async () => {
    const onClose = vi.fn();
    const { user } = renderUi(<Harness onClose={onClose} />);
    const opener = screen.getByRole('button', { name: 'Add player' });
    await user.click(opener);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    const { user } = renderUi(<Harness onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Add player' }));
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes on a tap on the backdrop but not on its content', async () => {
    const onClose = vi.fn();
    const { user } = renderUi(<Harness onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Add player' }));
    await user.click(screen.getByText('Label and shirt number only.'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('asks its owner to close when the platform cancels it', async () => {
    const onClose = vi.fn();
    const { user } = renderUi(<Harness onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Add player' }));
    const cancel = new Event('cancel', { cancelable: true });
    screen.getByRole('dialog').dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('uses the native modal API when the browser has it', () => {
    const showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    });
    const close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    });
    Object.assign(HTMLDialogElement.prototype, { showModal, close });
    try {
      const onClose = vi.fn();
      const { rerender } = renderUi(
        <Sheet open title="Native" onClose={onClose}>
          <p>Body</p>
        </Sheet>,
      );
      expect(showModal).toHaveBeenCalledTimes(1);
      // Esc is the platform's job here; the kit must not handle it twice.
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
      expect(onClose).not.toHaveBeenCalled();
      rerender(
        <Sheet open={false} title="Native" onClose={onClose}>
          <p>Body</p>
        </Sheet>,
      );
      expect(close).toHaveBeenCalledTimes(1);
      // Closing on the owner's request does not echo back as another close request.
      expect(onClose).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
      Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
    }
  });

  it('reports a close the browser made on its own', () => {
    const onClose = vi.fn();
    renderUi(
      <Sheet open title="Forced" onClose={onClose}>
        <p>Body</p>
      </Sheet>,
    );
    const dialog = screen.getByRole('dialog');
    dialog.removeAttribute('open');
    dialog.dispatchEvent(new Event('close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
