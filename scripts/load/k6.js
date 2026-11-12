// Load test for the three paths a match day depends on: the app loading, a
// coach reading a match, and a coach recording events. It runs against the
// live site and database with a throwaway test account, creates its own club,
// and deletes it afterwards.
//
//   k6 run scripts/load/k6.js   (see .github/workflows/load.yml for the env)
//
// Budgets are set for a volunteer coach on a phone: the app must feel instant
// and a tapped event must be saved well within a couple of seconds.

import { check, fail } from 'k6';
import http from 'k6/http';
// The two helper libraries are kept in the repository, byte for byte as jslib.k6.io serves
// them, so a run does not download code (scripts/load/vendor/README.md has the checksums).
import { uuidv4 } from './vendor/k6-utils/1.4.0/index.js';
import { textSummary } from './vendor/k6-summary/0.1.0/index.js';

const SITE = __ENV.SITE_URL;
const API = __ENV.SUPABASE_URL;
const KEY = __ENV.SUPABASE_PUBLISHABLE_KEY;

export const options = {
  scenarios: {
    // Twenty people opening the app every second, for thirty seconds: 600 opens, far more
    // than a club has members. Arrivals are paced on purpose. An earlier run looped without
    // a pause (about 1,300 requests a second from one address) and the host's attack
    // protection throttled it, which is that protection working, not the app being slow.
    site: {
      executor: 'constant-arrival-rate',
      exec: 'site',
      rate: 20,
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 20,
      maxVUs: 60,
    },
    // The health endpoint, which itself asks the database and the sign-in service.
    health: {
      executor: 'constant-arrival-rate',
      exec: 'health',
      rate: 2,
      timeUnit: '1s',
      duration: '20s',
      preAllocatedVUs: 4,
      maxVUs: 10,
      startTime: '96s',
    },
    // Ten coaches re-reading a match review.
    read: { executor: 'constant-vus', exec: 'read', vus: 10, duration: '30s', startTime: '32s' },
    // Events arriving at five per second: far above one coach, below the write limit.
    write: {
      executor: 'constant-arrival-rate',
      exec: 'write',
      rate: 5,
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 10,
      maxVUs: 20,
      startTime: '64s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_failed{scenario:site}': ['rate<0.01'],
    'http_req_failed{scenario:read}': ['rate<0.01'],
    'http_req_failed{scenario:write}': ['rate<0.01'],
    'http_req_failed{scenario:health}': ['rate<0.01'],
    'http_req_duration{scenario:site}': ['p(95)<500'],
    'http_req_duration{scenario:read}': ['p(95)<800'],
    'http_req_duration{scenario:write}': ['p(95)<1000'],
    'http_req_duration{scenario:health}': ['p(95)<1500'],
    dropped_iterations: ['count==0'],
    checks: ['rate>0.99'],
  },
};

function headers(token) {
  return {
    apikey: KEY,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

function must(response, what) {
  if (response.status < 200 || response.status >= 300) {
    fail(`${what} failed with HTTP ${response.status}`);
  }
  return response;
}

export function setup() {
  const login = must(
    http.post(
      `${API}/auth/v1/token?grant_type=password`,
      JSON.stringify({ email: __ENV.KLUPA_IT_EMAIL, password: __ENV.KLUPA_IT_PASSWORD }),
      { headers: { apikey: KEY, 'Content-Type': 'application/json' } },
    ),
    'sign-in',
  );
  const token = login.json('access_token');
  const userId = login.json('user.id');
  const json = headers(token);
  const returning = Object.assign({ Prefer: 'return=representation' }, json);

  const clubId = must(
    http.post(
      `${API}/rest/v1/rpc/create_club`,
      JSON.stringify({ club_name: 'Load test club', demo: true }),
      { headers: json },
    ),
    'create club',
  ).json();
  const teamId = must(
    http.post(
      `${API}/rest/v1/teams`,
      JSON.stringify({ club_id: clubId, name: 'Load U13', age_group: 'u13' }),
      { headers: returning },
    ),
    'create team',
  ).json('0.id');
  const matchId = must(
    http.post(
      `${API}/rest/v1/matches`,
      JSON.stringify({
        club_id: clubId,
        team_id: teamId,
        opponent: 'Load rival',
        played_on: new Date().toISOString().slice(0, 10),
      }),
      { headers: returning },
    ),
    'create match',
  ).json('0.id');
  must(
    http.patch(`${API}/rest/v1/matches?id=eq.${matchId}`, JSON.stringify({ status: 'live' }), {
      headers: json,
    }),
    'start match',
  );

  // A realistic match to read back: forty events across two periods.
  const seed = [];
  for (let i = 0; i < 40; i += 1) {
    seed.push({
      club_id: clubId,
      match_id: matchId,
      client_id: uuidv4(),
      period: i < 20 ? 1 : 2,
      clock_seconds: 60 + i * 40,
      side: i % 3 === 0 ? 'away' : 'home',
      kind: i % 4 === 0 ? 'shot_on_target' : 'box_entry',
      weight: i % 4 === 0 ? 900 : 300,
      created_by: userId,
    });
  }
  must(
    http.post(`${API}/rest/v1/match_events`, JSON.stringify(seed), { headers: json }),
    'seed events',
  );

  return { token, userId, clubId, matchId };
}

export function site() {
  const page = http.get(`${SITE}/`);
  const health = http.get(`${SITE}/healthz.json`);
  check(page, { 'app shell is served': (r) => r.status === 200 && r.body.includes('id="root"') });
  check(health, { 'health file says ok': (r) => r.status === 200 && r.json('status') === 'ok' });
}

export function health() {
  const response = http.get(`${SITE}/api/health`);
  check(response, {
    'database and sign-in answered': (r) =>
      r.status === 200 &&
      r.json('checks.database.ok') === true &&
      r.json('checks.auth.ok') === true,
  });
}

export function read(data) {
  const response = http.get(
    `${API}/rest/v1/match_events?select=id,period,clock_seconds,side,kind,weight,x,y,header` +
      `&club_id=eq.${data.clubId}&match_id=eq.${data.matchId}&deleted_at=is.null` +
      '&order=period.asc,clock_seconds.asc&limit=2000',
    { headers: headers(data.token) },
  );
  check(response, {
    'events are returned': (r) => r.status === 200 && r.json().length >= 40,
  });
}

export function write(data) {
  const event = {
    club_id: data.clubId,
    match_id: data.matchId,
    client_id: uuidv4(),
    period: 2,
    clock_seconds: 900 + Math.floor(Math.random() * 600),
    side: 'home',
    kind: 'corner',
    weight: 250,
    created_by: data.userId,
  };
  const send = () =>
    http.post(`${API}/rest/v1/match_events?on_conflict=match_id,client_id`, JSON.stringify(event), {
      headers: Object.assign(
        { Prefer: 'resolution=ignore-duplicates,return=minimal' },
        headers(data.token),
      ),
    });
  check(send(), { 'event is stored': (r) => r.status === 201 });
  // One in five is sent twice, as a phone does after a dropped connection.
  if (Math.random() < 0.2) {
    check(send(), { 'retry is accepted and ignored': (r) => r.status >= 200 && r.status < 300 });
  }
}

export function teardown(data) {
  const stored = http.get(
    `${API}/rest/v1/match_events?select=client_id&club_id=eq.${data.clubId}&match_id=eq.${data.matchId}&limit=2000`,
    { headers: headers(data.token) },
  );
  const ids = stored.json().map((row) => row.client_id);
  if (new Set(ids).size !== ids.length) fail('a retried event was stored twice');
  must(
    // The same erasure function the app calls.
    http.post(`${API}/rest/v1/rpc/delete_club`, JSON.stringify({ target_club: data.clubId }), {
      headers: headers(data.token),
    }),
    'delete club',
  );
}

export function handleSummary(data) {
  // k6 puts whatever setup() returned into the summary. That includes the session token,
  // which must never reach an artifact or a repository, so it is left out here.
  const { setup_data: _session, ...shareable } = data;
  return {
    'load-summary.json': JSON.stringify(shareable, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: false }),
  };
}
