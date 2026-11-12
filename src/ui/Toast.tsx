import { AnimatePresence, motion } from 'motion/react';
import { CircleCheck, CircleAlert, Info, X, type LucideIcon } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { DURATION, EASE, PRESS, SPRING, cx } from './internal';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastInput {
  tone: ToastTone;
  message: string;
}

export interface ToastApi {
  toast: (input: ToastInput) => void;
}

interface ToastEntry extends ToastInput {
  id: number;
}

/** How long a toast stays, in milliseconds. Paused while the coach's finger or focus is on it. */
export const TOAST_DURATION_MS = 4000;

const ToastContext = createContext<ToastApi | null>(null);

const TONE: Record<ToastTone, { icon: LucideIcon; glyph: string }> = {
  success: { icon: CircleCheck, glyph: 'text-pitch' },
  error: { icon: CircleAlert, glyph: 'text-clay' },
  info: { icon: Info, glyph: 'text-ink-soft' },
};

function ToastItem({ entry, onDismiss }: { entry: ToastEntry; onDismiss: (id: number) => void }) {
  const { t } = useTranslation();
  const [paused, setPaused] = useState(false);
  const { icon: Icon, glyph } = TONE[entry.tone];

  useEffect(() => {
    if (paused) return undefined;
    const timer = window.setTimeout(() => {
      onDismiss(entry.id);
    }, TOAST_DURATION_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [entry.id, onDismiss, paused]);

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: DURATION.quick, ease: EASE } }}
      transition={SPRING.settle}
      onPointerEnter={() => {
        setPaused(true);
      }}
      onPointerLeave={() => {
        setPaused(false);
      }}
      onFocus={() => {
        setPaused(true);
      }}
      onBlur={() => {
        setPaused(false);
      }}
      className="material-chrome pointer-events-auto flex w-full items-center gap-3 rounded-[14px] border border-hairline py-1.5 pr-1.5 pl-4 text-ink shadow-float"
    >
      <Icon aria-hidden="true" size={20} strokeWidth={2.25} className={cx('shrink-0', glyph)} />
      <p className="min-w-0 flex-1 py-1.5 text-[15px]">
        <span className="sr-only">{t(`ui.toast.${entry.tone}`)}: </span>
        {entry.message}
      </p>
      <button
        type="button"
        aria-label={t('ui.dismiss')}
        onClick={() => {
          onDismiss(entry.id);
        }}
        className={cx(
          'grid size-11 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-mute-soft hover:text-ink',
          PRESS,
        )}
      >
        <X aria-hidden="true" size={18} strokeWidth={2.25} />
      </button>
    </motion.li>
  );
}

function ToastRegion({
  live,
  entries,
  onDismiss,
}: {
  live: 'polite' | 'assertive';
  entries: readonly ToastEntry[];
  onDismiss: (id: number) => void;
}) {
  return (
    <ul aria-live={live} aria-relevant="additions" className="flex w-full flex-col gap-2">
      <AnimatePresence initial={false}>
        {entries.map((entry) => (
          <ToastItem key={entry.id} entry={entry} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </ul>
  );
}

/**
 * Hosts toasts for the app. Both live regions exist from the start so screen readers are
 * listening before the first message arrives; errors go to the assertive one.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<readonly ToastEntry[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setEntries((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      toast: ({ tone, message }) => {
        nextId.current += 1;
        const id = nextId.current;
        setEntries((current) => [...current, { id, tone, message }]);
      },
    }),
    [],
  );

  const errors = entries.filter((entry) => entry.tone === 'error');
  const others = entries.filter((entry) => entry.tone !== 'error');

  return (
    <ToastContext.Provider value={api}>
      {children}
      <section
        aria-label={t('ui.notifications')}
        // Sits above the tab bar (4.5 rem) and the home indicator.
        className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 mx-auto flex w-[min(28rem,calc(100%-2rem))] flex-col gap-2"
      >
        <ToastRegion live="assertive" entries={errors} onDismiss={dismiss} />
        <ToastRegion live="polite" entries={others} onDismiss={dismiss} />
      </section>
    </ToastContext.Provider>
  );
}

/** Show a short confirmation or problem. Must be used inside `<ToastProvider>`. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (api === null) {
    throw new Error('useToast() must be used inside <ToastProvider>. Wrap the app root in it.');
  }
  return api;
}
