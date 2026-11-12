import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorKey } from '../../lib/errors';
import { useToast } from '../../ui';

export type Busy = 'code' | 'verify' | 'demo' | null;
export type Run = (kind: Exclude<Busy, null>, action: () => Promise<void>) => Promise<void>;

/** Runs one sign-in action at a time, marks which one is busy, and explains a failure. */
export function useRun(): { readonly busy: Busy; readonly run: Run } {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [busy, setBusy] = useState<Busy>(null);
  const run = useCallback<Run>(
    async (kind, action) => {
      setBusy(kind);
      try {
        await action();
      } catch (error) {
        toast({ tone: 'error', message: t(errorKey(error)) });
      } finally {
        setBusy(null);
      }
    },
    [t, toast],
  );
  return { busy, run };
}
