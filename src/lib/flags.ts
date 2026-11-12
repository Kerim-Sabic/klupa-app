/*
 * Switches for turning a feature off without changing code: set VITE_DISABLED_FEATURES in the
 * host's settings (for example "labs,liveFeed") and redeploy. Everything is on unless it is
 * named there, so a missing or misspelt setting can never switch something off by accident.
 *
 * These are kill switches for a bad release, not a way to hide unfinished work.
 */

export const FLAGS = ['labs', 'liveFeed', 'errorReports', 'pageSpeed'] as const;
export type Flag = (typeof FLAGS)[number];

const isFlag = (name: string): name is Flag => (FLAGS as readonly string[]).includes(name);

/** The features named in the setting. Unknown names and stray spaces are ignored. */
export function parseDisabled(setting: string | undefined): ReadonlySet<Flag> {
  const names = (setting ?? '').split(',').map((name) => name.trim());
  return new Set(names.filter(isFlag));
}

/** True unless the feature was switched off for this build. */
export function isEnabled(flag: Flag, disabled: ReadonlySet<Flag>): boolean {
  return !disabled.has(flag);
}
