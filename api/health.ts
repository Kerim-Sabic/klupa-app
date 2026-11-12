import { HEALTHY_FOR_SECONDS, probeHealth } from '../src/health/probe';

/*
 * GET /api/health: the one piece of server code in Klupa, run at the edge by the host.
 * It answers 200 only when the database and the sign-in service both answered, 503 otherwise,
 * so an uptime monitor needs no knowledge of the body. Read-only, takes no input.
 *
 * Anyone can call it, and each call costs three calls downstream: two to the database (the
 * health function and the field pulse) and one to the sign-in service. So a healthy answer is
 * kept at the edge for fifteen seconds: however often it is asked, the database and the
 * sign-in service are asked at most a few times a minute. A failing answer is never kept.
 */
// Runs in Frankfurt, next to the database, so the timings are the app's own and not the Atlantic's.
export const config = { runtime: 'edge', regions: ['fra1'] };

export default async function handler(request: Request): Promise<Response> {
  const report = await probeHealth({
    supabaseUrl: process.env.VITE_SUPABASE_URL,
    supabaseKey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    commit: process.env.VERCEL_GIT_COMMIT_SHA,
    // The host's own id for this request, so a failed probe can be found in its logs.
    requestId: request.headers.get('x-vercel-id') ?? crypto.randomUUID(),
    fetch,
  });
  const healthy = report.status === 'ok';
  if (!healthy) {
    // One structured line per failed probe, so the host's log search can find and count them.
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'health.degraded',
        requestId: report.requestId,
        commit: report.commit,
        checks: report.checks,
      }),
    );
  }
  return new Response(JSON.stringify(report), {
    status: healthy ? 200 : 503,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Browsers never keep it; the edge keeps a healthy answer briefly, a failing one never.
      'Cache-Control': healthy
        ? `public, max-age=0, s-maxage=${String(HEALTHY_FOR_SECONDS)}`
        : 'no-store',
      'X-Request-Id': report.requestId,
    },
  });
}
