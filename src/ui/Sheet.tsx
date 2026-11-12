import { X } from 'lucide-react';
import { useEffect, useEffectEvent, useId, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PRESS, cx } from './internal';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

function supportsModal(dialog: HTMLDialogElement): boolean {
  return typeof dialog.showModal === 'function';
}

function show(dialog: HTMLDialogElement): void {
  if (supportsModal(dialog)) {
    dialog.showModal();
  } else {
    // Environments without the modal API (jsdom) still get an open, labelled dialog.
    dialog.setAttribute('open', '');
    dialog.querySelector<HTMLElement>('[data-sheet-close]')?.focus();
  }
}

function hide(dialog: HTMLDialogElement): void {
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
}

/*
 * Enter and exit are CSS transitions on the native dialog: `starting:` gives the first frame,
 * `transition-discrete` keeps it visible while it leaves. The rise uses the `ease-spring` curve
 * (a critically damped spring sampled into `linear()`), so it decelerates like a thrown card
 * and settles without a bounce. The backdrop dims and softens the page rather than washing it
 * out, so the sheet reads as above it. The global reduced-motion rule shortens all of it.
 */
const MOTION = cx(
  'opacity-0 translate-y-full sm:translate-y-3 sm:scale-[0.97]',
  'open:opacity-100 open:translate-y-0 sm:open:scale-100',
  'starting:open:opacity-0 starting:open:translate-y-full sm:starting:open:translate-y-3 sm:starting:open:scale-[0.97]',
  'transition-[opacity,translate,scale,overlay,display] transition-discrete duration-[420ms] ease-spring',
  'backdrop:bg-black/0 open:backdrop:bg-black/35 starting:open:backdrop:bg-black/0',
  'backdrop:backdrop-blur-[2px] backdrop:transition-[background-color,overlay,display] backdrop:transition-discrete backdrop:duration-300',
);

const PLACEMENT = cx(
  // Phone: a sheet rising from the bottom edge, clear of the home indicator.
  'fixed inset-x-0 bottom-0 top-auto m-0 w-full max-w-none max-h-[92dvh] rounded-t-[22px]',
  // From 640 px: a centred card.
  'sm:inset-0 sm:m-auto sm:h-fit sm:w-[min(32rem,calc(100%-2rem))] sm:max-h-[85dvh] sm:rounded-card',
);

/**
 * A modal sheet on the native `<dialog>`: focus trap, Esc and an inert page come with
 * `showModal()`. Controlled: it only opens and closes through `open`, and every way of
 * dismissing it (Esc, the close button, a tap on the backdrop) asks via `onClose`.
 */
export function Sheet({ open, onClose, title, children, footer }: SheetProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const wantsOpen = useRef(open);
  const requestClose = useEffectEvent(() => {
    onClose();
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    wantsOpen.current = open;
    if (open && !dialog.hasAttribute('open')) {
      opener.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      show(dialog);
    } else if (!open && dialog.hasAttribute('open')) {
      hide(dialog);
      opener.current?.focus();
      opener.current = null;
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return undefined;
    const onCancel = (event: Event) => {
      event.preventDefault();
      requestClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      // The native dialog turns Esc into `cancel`; without the modal API we do it ourselves.
      if (event.key === 'Escape' && !supportsModal(dialog)) {
        event.preventDefault();
        requestClose();
      }
    };
    const onNativeClose = () => {
      // Some browsers close on a repeated Esc despite `preventDefault`; keep the owner in sync.
      if (wantsOpen.current) requestClose();
    };
    const onClick = (event: MouseEvent) => {
      // Content fills the dialog box, so a click that lands on the dialog itself is the backdrop.
      if (event.target === dialog) requestClose();
    };
    dialog.addEventListener('cancel', onCancel);
    dialog.addEventListener('keydown', onKeyDown);
    dialog.addEventListener('click', onClick);
    dialog.addEventListener('close', onNativeClose);
    return () => {
      dialog.removeEventListener('close', onNativeClose);
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('keydown', onKeyDown);
      dialog.removeEventListener('click', onClick);
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className={cx('overflow-hidden bg-raised p-0 text-ink shadow-float', PLACEMENT, MOTION)}
    >
      <div className="flex max-h-[inherit] flex-col">
        <span
          aria-hidden="true"
          className="mx-auto mt-2 block h-[5px] w-9 shrink-0 rounded-full bg-mute/45 sm:hidden"
        />
        <div className="flex items-center justify-between gap-3 border-b border-hairline py-2 pr-2 pl-5">
          <h2 id={titleId} className="min-w-0 text-headline font-semibold text-balance">
            {title}
          </h2>
          <button
            type="button"
            data-sheet-close=""
            aria-label={t('ui.close')}
            onClick={() => {
              onClose();
            }}
            className={cx(
              'grid size-11 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-mute-soft hover:text-ink',
              PRESS,
            )}
          >
            <X aria-hidden="true" size={20} strokeWidth={2.25} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {children}
        </div>
        {footer !== undefined && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-hairline px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </dialog>
  );
}
