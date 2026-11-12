import { z } from 'zod';
import { parseDisabled, type Flag } from './flags';

const schema = z.object({
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  // The commit this bundle was built from; set by the build, absent on a developer machine.
  VITE_RELEASE: z.string().min(1).max(64).optional(),
  // Features switched off for this build, as a comma-separated list (see flags.ts).
  VITE_DISABLED_FEATURES: z.string().max(200).optional(),
});

export interface Env {
  readonly supabaseUrl: string;
  readonly supabaseKey: string;
  readonly release: string;
  readonly disabled: ReadonlySet<Flag>;
}

/** The role claim of a legacy JWT key, or null when the key is not a JWT. */
function jwtRole(key: string): string | null {
  const payload = key.split('.')[1];
  if (payload === undefined) return null;
  try {
    const json: unknown = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json === 'object' && json !== null && 'role' in json ? String(json.role) : null;
  } catch {
    return null;
  }
}

/**
 * Validate configuration at start-up. There are no development fallbacks: a
 * missing value stops the app, and a secret key is refused outright because
 * anything given to the browser is public.
 */
export function parseEnv(source: Record<string, unknown>): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Klupa cannot start: missing or invalid configuration (${fields}).`);
  }
  const key = result.data.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (key.startsWith('sb_secret_') || jwtRole(key) === 'service_role') {
    throw new Error('Klupa cannot start: a secret key was configured for the browser.');
  }
  return {
    supabaseUrl: result.data.VITE_SUPABASE_URL,
    supabaseKey: key,
    release: result.data.VITE_RELEASE ?? 'local',
    disabled: parseDisabled(result.data.VITE_DISABLED_FEATURES),
  };
}

export const env: Env = parseEnv(import.meta.env);
