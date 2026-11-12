import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';

/** How long to wait for a page whose code or data is still arriving before giving up. */
const WAIT_MS = 4000;

/**
 * Tells keyboard and screen-reader users that the page changed. A single-page app swaps the
 * content without loading a document, so nothing is announced and focus stays on the link
 * that was pressed, now possibly gone. After each move to a new address this puts focus on
 * the new page's `<h1>` (so the next Tab starts at the top of the page) and says its text in
 * a polite live region.
 *
 * Only the path counts: typing in a search box or closing a sheet changes the query, not the
 * page. The first page is left alone, because the browser announces a document it loads.
 *
 * A control inside a page can change the path too: the replay's match picker, the fairness
 * tabs. Then the page did not swap under the coach, the control they are using is still there,
 * and taking focus from it would lose their place. So focus moves only when what had it is
 * gone or sits outside the page's content (the tab bar, the header).
 */
export function RouteAnnouncer() {
  const { pathname } = useLocation();
  const first = useRef(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return undefined;
    }
    const arrive = (): boolean => {
      const heading = document.querySelector('h1');
      if (!(heading instanceof HTMLElement)) return false;
      const active = document.activeElement;
      const stillInUse =
        active instanceof HTMLElement && active.isConnected && active.closest('main') !== null;
      if (!stillInUse) {
        // Focusable from script only: it is not a stop in the Tab order.
        heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      }
      setMessage(heading.textContent.replace(/\s+/g, ' ').trim());
      return true;
    };
    if (arrive()) return undefined;
    // The page's code or data is still on its way: take the heading when it appears.
    const observer = new MutationObserver(() => {
      if (arrive()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setTimeout(() => {
      observer.disconnect();
    }, WAIT_MS);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [pathname]);

  return (
    // A plain live region, not role="status": pages use that role for their own loading states.
    <p aria-live="polite" aria-atomic="true" data-route-announcer="" className="sr-only">
      {message}
    </p>
  );
}
