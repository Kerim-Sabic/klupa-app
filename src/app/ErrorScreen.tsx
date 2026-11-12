import { RotateCw, TriangleAlert } from 'lucide-react';
import { Component, useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouteError } from 'react-router';
import { Button } from '../ui';
import { reporter } from './reporter';

const RELOAD_FLAG = 'klupa:reloaded-for-update';

/**
 * True when the code of a screen could not be downloaded. That happens when a new release
 * went out while the app was open: the old page asks for files that no longer exist.
 */
export function isStaleChunk(error: unknown): boolean {
  return (
    error instanceof Error &&
    /dynamically imported module|module script failed|error loading dynamically/i.test(
      error.message,
    )
  );
}

/** Reload for a new release at most once per tab, so a real outage cannot loop. */
function mayReloadForUpdate(): boolean {
  try {
    if (window.sessionStorage.getItem(RELOAD_FLAG) !== null) return false;
    window.sessionStorage.setItem(RELOAD_FLAG, '1');
    return true;
  } catch {
    // Storage is blocked in some private windows: without a guard, never reload unasked.
    return false;
  }
}

interface CrashNoticeProps {
  readonly updating: boolean;
  readonly onReload: () => void;
}

/** What a coach sees instead of a blank page: what happened, and the two ways forward. */
function CrashNotice({ updating, onReload }: CrashNoticeProps) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="mx-auto flex max-w-xl flex-col items-start gap-3 px-4 py-12">
      <TriangleAlert aria-hidden="true" size={28} className="text-clay" />
      <h1 className="font-display text-3xl text-ink">
        {t(updating ? 'crash.updated.title' : 'crash.title')}
      </h1>
      <p className="text-ink-soft">{t(updating ? 'crash.updated.body' : 'crash.body')}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button icon={<RotateCw />} onClick={onReload}>
          {t('crash.reload')}
        </Button>
        {/* A plain link, not the router: the router itself may be what failed. */}
        <a
          href="/"
          className="inline-flex min-h-11 items-center rounded-control px-4 font-semibold text-pitch underline-offset-4 hover:underline"
        >
          {t('crash.home')}
        </a>
      </div>
    </div>
  );
}

const reloadPage = (): void => {
  window.location.reload();
};

/**
 * Shown by the router when a screen throws while loading or rendering. The error is reported,
 * and if the cause is a release that replaced the files, the page reloads itself once.
 */
export function RouteError({ reload = reloadPage }: { readonly reload?: () => void }) {
  const error = useRouteError();
  const updating = isStaleChunk(error);
  useEffect(() => {
    void reporter.report(error);
    if (updating && mayReloadForUpdate()) reload();
  }, [error, reload, updating]);
  return <CrashNotice updating={updating} onReload={reload} />;
}

interface BoundaryProps {
  readonly children: ReactNode;
  readonly reload?: () => void;
}

/** The last line of defence, around the whole app: providers and the router included. */
export class AppErrorBoundary extends Component<BoundaryProps, { readonly failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    void reporter.report(error);
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return <CrashNotice updating={false} onReload={this.props.reload ?? reloadPage} />;
  }
}
