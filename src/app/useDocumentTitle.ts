import { useEffect } from 'react';

/** What every title ends with, and the whole title of a page that has no heading. */
export const APP_NAME = 'Klupa';

/** "Matches · Klupa" from a page's heading; the app's name alone when there is none. */
export function titleFor(heading: string | null): string {
  const text = heading === null ? '' : heading.replace(/\s+/g, ' ').trim();
  return text === '' || text === APP_NAME ? APP_NAME : `${text} · ${APP_NAME}`;
}

/**
 * Gives every page its own title in the browser tab, the history list and a screen reader's
 * window list, taken from the page's one `<h1>`. Until now all routes shared "Klupa".
 *
 * The heading is read from the page itself and not from the route table, so the title is
 * always what the coach sees, in their language. It also arrives late in several ways: a
 * route's code is downloaded on first use, a match's name comes with its data, and switching
 * language rewrites it in place. So the hook does not wait for one moment; it follows the
 * page for as long as the app is open and writes the title only when the heading changed.
 *
 * It is kept cheap: one observer and one live list of headings for the whole session, no
 * work per mutation beyond reading the first heading's text, and nothing left behind on
 * cleanup. `document.title` lives in `<head>`, outside what is watched, so writing it cannot
 * wake the observer.
 */
export function useDocumentTitle(): void {
  useEffect(() => {
    // A live list: the browser keeps it current, so it is asked for once and never rebuilt.
    const headings = document.getElementsByTagName('h1');
    let seen: string | null | undefined;
    const sync = (): void => {
      const heading = headings.item(0)?.textContent ?? null;
      if (heading === seen) return;
      seen = heading;
      document.title = titleFor(heading);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
    };
  }, []);
}
