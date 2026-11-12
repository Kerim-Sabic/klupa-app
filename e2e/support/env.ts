/** Test configuration read from the environment. Values are never logged. */
export function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === '' ? undefined : value;
}

export function requiredEnv(name: string): string {
  const value = optionalEnv(name);
  if (value === undefined) throw new Error(`The environment variable ${name} is not set.`);
  return value;
}

/** The port of the preview server the tests start (see playwright.config.ts). */
export const PREVIEW_PORT = Number(optionalEnv('KLUPA_E2E_PORT') ?? 4173);

export const PREVIEW_HOST = 'localhost';

/** Where the app under test is served. */
export const PREVIEW_ORIGIN = `http://${PREVIEW_HOST}:${String(PREVIEW_PORT)}`;
