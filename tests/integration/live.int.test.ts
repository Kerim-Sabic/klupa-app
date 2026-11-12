import { afterAll, describe } from 'vitest';
import { supabase } from '../../src/lib/supabase';
import { clubSteps } from './clubSteps';
import { insightSteps } from './insightSteps';
import { matchSteps } from './matchSteps';
import { momentumSteps } from './momentumSteps';
import { sessionSteps } from './sessionSteps';
import { setupSteps } from './setupSteps';
import { IT_EMAIL, removeAllClubs, type Scenario } from './support';

/**
 * One ordered walk through the app's real data-access layer against the real Supabase project,
 * signed in as a throwaway test user. The steps share state; tests in one describe run in file order.
 * Skipped when no test account is configured, so CI without secrets stays green.
 */
const noAccount = IT_EMAIL === undefined || IT_EMAIL === '';
// On a developer machine without the test account these are left out; CI must never do that.
if (noAccount && (process.env['CI'] ?? '') !== '') {
  throw new Error('KLUPA_IT_EMAIL is not set: CI must run the integration tests.');
}

describe.skipIf(noAccount)('live data layer', () => {
  const scenario: Scenario = {};

  setupSteps(scenario);
  matchSteps(scenario);
  momentumSteps(scenario);
  sessionSteps(scenario);
  insightSteps(scenario);
  clubSteps(scenario);

  afterAll(async () => {
    try {
      const { data } = await supabase.auth.getUser();
      if (data.user !== null) await removeAllClubs(data.user.id);
    } catch {
      // Best effort: a failed clean-up must not hide the real result.
    }
    await supabase.auth.signOut();
  });
});
