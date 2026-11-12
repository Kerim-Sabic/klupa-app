# Architecture

Klupa is a single-page web app backed by a Postgres database that enforces every rule itself. There is no application server to keep in sync with the database, so there is one place where access is decided.

```
 Phone or laptop (browser)                         Supabase (Frankfurt, EU)
┌──────────────────────────────────────┐          ┌─────────────────────────────────────┐
│ React app (static files from Vercel) │  HTTPS   │ Auth: one-time email code, demo      │
│                                      │ ───────► │ REST API (PostgREST)                 │
│  features/  screens per job          │          │ Postgres 17                          │
│  ui/        design system            │          │  · row-level security, forced        │
│  engine/    pure analytics, no I/O   │          │  · composite tenant keys             │
│  lib/       session, club, data      │          │  · audit triggers, state machine     │
│  outbox     offline queue (tagger)   │          │  · write limits, retention job       │
└──────────────────────────────────────┘          └─────────────────────────────────────┘
        ▲ built and checked by GitHub Actions; deployed by Vercel on every push to main
```

## Principles

1. **The database is the security boundary.** The browser only ever holds a publishable key. Every table has row-level security enabled and forced, scoped by club membership. A bug in the app cannot expose another club's data, because the database would refuse the query.
2. **Analytics are pure functions.** `src/engine` has no network, no clock and no randomness. The same input gives the same output on a phone, in CI and in a research script. That is what makes the golden tests against the research possible.
3. **Exact arithmetic for evidence.** Chance quality is stored and summed in integer units of 1/10,000. "Would removing one chance flip this?" is then an exact comparison, not a floating-point guess.
4. **One source of truth per concern.** One Supabase client, one auth provider, one club provider, one file per feature for data access, one file per language per feature for text.
5. **Less data, on purpose.** A player is a label and a shirt number. The optional birth quarter is the only age information. The audit log records which columns changed, never their values.

## Code map

| Path                   | Responsibility                                                                                                            | Depends on            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `src/engine/`          | Momentum windows and robustness, expected goals, opportunity ledger, planner, load, facility use, relative age, intervals | `data`, one exception |
| `src/data/`            | Bundled reference data: drill library, xG coefficients, demo matches                                                      | `engine` types        |
| `src/lib/`             | Environment validation, Supabase client, session, active club, shared reads, error mapping                                | Supabase              |
| `src/ui/`              | Design-system components                                                                                                  | tokens in `index.css` |
| `src/features/<name>/` | One job each: `matches`, `momentum`, `sessions`, `insights`, `club`, `pro`, `movement`, `shotlab`, `overlay`              | `ui`, `lib`, `engine` |
| `src/app/`             | Providers, routing, guards, sign-in, onboarding, home                                                                     | everything above      |
| `supabase/migrations/` | Schema, policies, triggers, functions                                                                                     | —                     |
| `supabase/tests/`      | Three test files: two-club isolation, all-or-nothing writes, report and retention rules                                   | a database            |
| `research/`            | Reproducible studies and the model, in Python                                                                             | open datasets         |

Dependencies are meant to point one way: `app → features → ui / lib / engine`. Shared reads live in `src/lib/data.ts`. The code crosses that line in five places, and no lint rule guards it yet:

- `matches` and `momentum` import each other: the match review belongs to `momentum`, is mounted by the `matches` routes, and reads the event weights that `matches` defines.
- `pro` reuses pieces of two other features instead of copying them: from `momentum` the momentum explorer, the shot map, the review model and the chart helpers; from `movement` the pitch geometry and the 3D scene parts.
- `src/features/pro/toReview.ts` turns a professional match into the review events of `momentum` with the weights of `matches`, and imports both definitions from those features. The engine itself imports no feature, only bundled data from `src/data/`.
- `overlay` reuses three small pieces of `shotlab` instead of copying them: where the vision runtime is served from, the reading of a camera failure (and whether there is a camera at all), and the megabyte formatter.
- The pages of `pro`, `movement`, `shotlab` and `overlay` take their public page frame, and the club page its language switch, from `src/app/`.

`sessions`, `insights`, `club`, `movement` and `shotlab` import nothing from another feature.

## Data model

Fifteen tables: thirteen that hold club data and two that hold reports from the app (errors and page-speed samples), which the app can neither read nor write. Every tenant table carries `club_id` and references its parent with a composite `(club_id, id)` foreign key, so a row cannot reference something in another club even if a policy were wrong.

`clubs` → `club_members` (role) · `teams` → `players` · `matches` → `match_events`, `stints` · `sessions` → `session_drills`, `session_attendance`, `observations` · `audit_log` · `data_requests`

Rules the database enforces regardless of client:

- Match status moves `scheduled → live → finished` (and `finished → live` to reopen); nothing else.
- Events are accepted only once a match is live, only for periods the match has, and at most 600 per author per minute.
- Events are never hard-deleted by users: an undo sets `deleted_at`, and a nightly job purges after 30 days.
- A club always keeps at least one owner. A club is created together with its owner in one transaction, at most five per account.
- Privileges are granted per column, so `club_id`, `id` and `created_by` cannot be rewritten.

## Request paths

- **Read:** component → TanStack Query → feature `api.ts` → Supabase REST → Postgres checks the policy → rows.
- **Write (online):** the same path; the database validates, audits and rate-limits.
- **Write (pitch-side, poor signal):** the tagger puts each event in a local outbox with a client-generated id and sends it when it can. The unique key `(match_id, client_id)` makes a retry harmless.
- **Sign-in:** email one-time code or an anonymous demo session; the session lives in the Supabase client and is mirrored by `AuthProvider`.

## Build and release

GitHub Actions runs three jobs on every push and pull request: typecheck, lint (zero warnings), format, tests with a coverage gate and a production build; a full-history secret scan; and a database job that applies every migration to an empty Postgres and runs the isolation test. Vercel builds and deploys `main`. The build writes `/healthz.json` with the commit it was built from, and the smoke test compares that with the commit that passed CI.

## On-device vision

The Shot lab (`/shot`, public) turns one filmed strike into a skeleton, a moment of strike and a handful of measurements without the video leaving the phone.

```
 <input type=file accept=video/* capture=environment>
        │ File → object URL (revoked when no longer shown; never uploaded, never stored)
        ▼
 <video> plays at 0.5× ── requestVideoFrameCallback ──► PoseLandmarker (MediaPipe Tasks, VIDEO mode)
        (seek every 1/30 s where rVFC is missing)            │ 33 image landmarks + 33 world landmarks (m)
                                                             ▼
                                  src/engine/pose.ts (pure)  analyseShot(frames)
                                  visibility gate → gap fill + centred smoothing → ankle speeds
                                  → strike, backswing, follow-through → measurements
                                                             ▼
                   feature: prompts.ts (coaching reading) · VideoStage (canvas overlay)
                            Scrubber · SkeletonPanel → Skeleton3D (react-three-fiber, lazy)
```

- **Loading.** The route is already lazy. Inside it, `@mediapipe/tasks-vision` (≈154 kB, 46 kB gzip) is imported only when the coach picks a clip, and three.js with react-three-fiber (≈920 kB, 244 kB gzip) only when a result is on screen. The WebAssembly runtime (`public/vision/`, 14.6 MB, copied from the installed package by `scripts/vision/copy-assets.mjs`) and the lite pose model (`public/models/`, 5.8 MB, SHA-256 in its README) are served from our own origin, so the content security policy needs nothing beyond `'wasm-unsafe-eval'`. The model is fetched by us with a byte-level progress bar; the runtime is fetched by the library itself (prefetching it for progress made `vite preview` send it twice). Afterwards both come from the browser cache. A unit test pins every byte of both against the package and the recorded hash. The GPU delegate is tried first, then the CPU.
- **Frames.** Up to the first 6 seconds are read; a longer clip is cut and the result says so. The detector is asked for two bodies so a second person is noticed and reported, and the larger one is followed.
- **Coordinates.** World landmarks are metres with the origin between the hips, +y down, and z estimated by the model. Speeds are therefore relative to the hips, and any number that leans on z (shoulder-hip turn, sideways lean, sideways foot placement) is flagged "uses estimated depth" on screen and never raises a coaching prompt.
- **Strike.** After gap filling and a centred triangular smoothing (≈0.15 s), the strike is the frame where the faster ankle peaks. It must exceed 3 m/s, be at least 1.3× faster than any swing more than 0.3 s away, not sit on the clip's edge, and follow a backswing (the kicking knee bent to at most 135° within 0.6 s before, extending by at least 15° into the strike). Otherwise the result is a typed `no-strike` with its reason; a clip where hips, knees, ankles and shoulders average under 0.5 visibility, or no body in more than 40% of frames, or two people in more than 20%, is `not-seen` with reasons. Neither state shows numbers.
- **Measurements.** Knee angle at the top of the backswing and at the strike; largest hip-to-shoulder turn during the swing; trunk lean along and across the kick at the strike (axes from the kicking ankle's travel and the hip line); standing ankle relative to kicking ankle along and across the kick; peak ankle speed; swing time; highest ankle point relative to the hip after the strike. Each carries its unit and the frames it was read from. Prompts (`src/features/shotlab/prompts.ts`) are the feature's reading of these numbers with deliberately simple thresholds, phrased as things to look at, never as causes.
- **Tests.** A parametric kicking skeleton (`synthetic.ts`) gives motions with known answers: strike frame within one frame, backswing knee within 8°, mirroring swaps the foot, bounded noise changes nothing, a standing figure is "no clear strike". The same generator is the page's example.
- **Known limits.** One camera, so the far leg is often occluded and depth is a model estimate; no ball tracking, so the strike is the fastest-foot moment, usually just before contact; foot speed is not ball speed. MediaPipe's library contains a usage-metrics logger with no switch: it posts performance counters (never frames or landmarks) to `odml.pa.googleapis.com` once a minute while a task runs and when the task is closed. The page refuses that request before it leaves (`src/lib/usageReports.ts`, called by both detectors before the library is loaded), and the library stops trying after one refusal. The production CSP (`connect-src 'self'` plus Supabase) refuses it a second time. `e2e/overlay.spec.ts` runs against a server without those headers, leaves the page so the detector is closed, and fails if any request went to another origin; with the guard removed it fails on exactly this request.

### Player overlay

The Player overlay (`/overlay`, public) draws over a coach's own match video, or the live camera, where each player is and which team they are on. Nothing leaves the device.

```
 <input type=file accept=video/*>  or  getUserMedia (back camera, no sound)  or  the sample clip
        │ File → object URL (revoked on Stop; never uploaded, never stored)
        ▼
 <video> ── requestAnimationFrame, one analysis per new picture ──► ObjectDetector (MediaPipe Tasks,
        │                                                            EfficientDet-Lite0, people only)
        │ a 192 px copy of the frame, in memory                              │ boxes, as shares of the picture
        ▼                                                                    ▼
 teams.ts (pure)  shirtColour → OKLab ──► model.ts (pure) stepOverlay ◄── track.ts (pure) stepTracker
 two-means that leaves outliers out          │ players with a number, a team, feet and a trail
                                             ▼
                     draw.ts → <canvas> over the video        Readout: how many of each team, frames a second
```

- **Loading.** As in the Shot lab: the route is lazy, the library is imported and the model (`public/models/efficientdet_lite0.tflite`, 7.3 MB, Apache-2.0, SHA-256 in its README and pinned by a test) is fetched from our own origin only when the coach picks a source, with byte progress; the runtime in `public/vision/` is the one the Shot lab uses. The content security policy needs nothing new (`connect-src 'self'`, `media-src 'self' blob:`), and `/models/` and `/data/` are already cache-first in the service worker, so a second visit needs no network. The model is built once per visit and reused across starts. The GPU delegate is tried first, then the CPU.
- **Finding.** The model is asked for the `person` category only, and the category is checked again in `toDetections`, with a score of at least 0.3. Boxes are kept as shares of the picture, cut at its edges. The model runs on the page's own thread, so while it works no tap is answered; after each analysis the page therefore rests at least as long as the analysis took, and never less than 8 ms (`nextAnalysisAt`), so a device that needs ten milliseconds a picture still analyses every picture of a thirty-a-second camera. In Chromium with the processor slowed six times, on the sample clip, Pause was answered after 6.2 s without that rest and after 0.2 s with it, at one frame a second analysed instead of two.
- **Following** (`track.ts`). Each track predicts where its box will be from its smoothed speed; detections are matched greedily, best first, by intersection over union with that prediction (at least 0.2), or failing that by a box of similar size within 0.6 of its own height, which keeps a sprint together at a few frames a second. A matched box moves 60% of the way to its detection. A track gets a number, the lowest one free, at its third sighting, so a one-frame ghost never shows; a numbered track coasts for up to a second unseen and is then forgotten. Ties go to the older track, so the result does not depend on the order the detector lists people in. Tests include generated cases: any number of players in their own lanes, at random speeds with jitter and shuffled detections, keep their numbers.
- **Teams** (`teams.ts`). A player's shirt colour is the mean of the middle of the upper body of their box, smoothed over the frames they are seen in. Colours are compared in OKLab with lightness counting for half (half a team stands in shadow). The split starts from the two colours with the most company, then each team colour becomes the mean of the shirts near it, leaving out anything far from both, so a referee cannot drag a team's colour towards their own. Team "a" stays team "a" from frame to frame; a split learnt while one team was out of the picture is given up once a fresh look places clearly more shirts. Kits closer than 0.07 are not split and everyone is drawn white; a shirt further from its team than 0.6 of the gap between the teams is neutral.
- **Drawing.** A ring at the feet in the team's shirt colour (lifted to a lightness that shows on grass) over a dark edge, a number over the head, a fading trail of the last 18 foot positions. Solid ring, dashed ring and dotted white ring, so teams never differ by colour alone. Each layer can be switched off, also on a paused video.
- **What is kept.** Between two frames: boxes, one colour per player and two team colours, in memory. No frame, no file. Stop, leaving the page and hiding the tab release the camera and forget the rest. `e2e/overlay.spec.ts` records every request and socket from the moment the source is chosen: only GETs with no body to this site, for page code, the runtime, the model and the sample clip. The build those tests run has the app's own page-speed sample switched off; on the live site that sample (the kind of screen, the release and up to three load timings, once per page load, `docs/PRIVACY.md`) is the one other request a visit to this page can make, and it holds nothing read from the picture.
- **Known limits.** No calibration, so positions are in the picture, not on the pitch: no distances, no speeds. The model reads the frame at 320 px, so players who are small in the picture are often missed. The numbers are not shirt numbers, and a player who leaves the picture comes back with a new one. Overlapping players can be merged or swapped. With one team in view, a referee or goalkeeper can be taken for the other team. Checked in unit tests, with Chromium's fake camera and on the sample clip (where people are found within seconds); not on a real match from the touchline, and not on a real phone, where the frames a second are not known. The sample clip is stock footage of adults (README, Data and attribution).

## Match replay

The Match replay (`/movement`, public) plays seven professional matches (DFL open data, CC BY 4.0) from tracking data, to show what `src/engine/tracking.ts` can read. A grassroots coach's own matches have no tracking data, and the screen says so. `/movement` opens J03WN1; `/movement/:matchId` opens any match in the index, and an id that is not there gets a not-found message with a link back.

```
 fetch /data/tracking/index.json ─► zod (matches.ts): id, date, competition, clubs, score
 fetch /data/tracking/<id>.json  ─► parseTrackingMeta            (only the chosen match)
 fetch /data/tracking/<id>.bin   ─► streamed with byte progress ─► decodeTracking
        ▼
 usePlayback: one clock in a ref, moved by requestAnimationFrame; React hears it every 250 ms
        ├─► model.ts (pure)  readReplay: clock, team shapes, nearest-player share, speed, distance
        │        └─► ReadoutPanel · live line (throttled) · Pitch2D (SVG, at the readout's pace)
        └─► Pitch3D (react-three-fiber, lazy) ─► scene.ts: useFrame → update() moves existing objects
                 motion.ts samples every frame into preallocated buffers; ribbon.ts writes line strips
 fetch /data/tracking/<id>.physical.json ─► zod (physical.ts) ─► PhysicalSection (own loading and error)
```

- **Matches and clubs.** The index's `home` and `away` are the data file's side labels, not who hosted (the "home" label is the guest in four of the seven), so the screen names clubs and never says who played at home. The picker switches match by address, so each match has a link and Back works; the match view is remounted per match, so playback, layers and the chosen player start fresh. Shot marks come from the same match's event file in `src/data/dfl/`, whose sides are the same labels.
- **Loading.** The route is lazy; three.js and react-three-fiber load only when the 3D view is about to show (WebGL present, and, for reduced motion, only after the coach presses Play). Without WebGL, or if the 3D view throws, the same replay is drawn as a flat SVG pitch with the same transport and layers; that is also what the tests render. The seven binaries (about 20 MB) are never fetched in advance: the service worker precaches nothing and caches `/data/` files only once a match is opened.
- **Motion.** The files hold 4 positions a second. Players move on a Catmull-Rom curve through the samples (exactly the engine's values at sample times; the ball moves in straight lines because it turns sharply at a kick), and nothing is drawn across an absence. Each player is a figure (body, arms, legs, head) that turns towards the way they moved over the last 0.3 s (`headingsInto`; someone standing keeps their facing), leans into a run, and stands on a larger white plate from sprint speed (7 m/s, as in the physical report; 6.3 m/s to lose it again, so it does not flicker). The ball leaves a 1.5 s tail. Per frame nothing is allocated: positions, facings, the hull (`hull.ts`), the ribbons and the space grid are written into buffers made once, and the camera glides in place.
- **Layers.** Team shape (outfield hull and centre per side), space control (which team's player is nearest to each patch: nearest player only, not a physical model) and the last 10 seconds of a tapped player, whose speed is also written on the picture in km/h. The share in the panel is the engine's `spaceControl` on a 32 × 21 grid; the 3D pitch paints the same rule on a finer 63 × 41 grid (`space.ts`, held to the engine's answer cell for cell in a test) into one 252 × 164 texture, ten times a match second. The first-named club stands on round plates, with a solid outline and a solid tint; the second on square plates, with a dashed outline and stripes, so no layer depends on colour alone.
- **Numbers.** Speed is the distance over the last second (never ahead of the moment shown); distance is summed from the start of the half. Steps faster than 12 m/s are treated as tracking glitches and left out. Both are labelled approximate on screen: 4 Hz positions cut corners.
- **Physical report.** Measured by the research pipeline from the full 25 Hz data (`research/README.md`): distance, high-speed distance, sprints and top speed per player and per club, with the thresholds read from the file and stated in words, and the player time left out for tracking jumps. Top speed is shown in km/h, with m/s in the accessible text. Names appear only here, as the short names of the public match information.
- **Scene.** A night match in both themes: a lit pitch that fades into a dark ground, so the canvas is never a pale rectangle on a dark page (`NIGHT` in `sceneParts.ts`; the small goal replays of the pro matches keep the page's own colours). The whole roster is six draw calls: instanced body, head, two kinds of plate, an unseen tap target, and the shirt numbers as one instanced quad that a ten-line shader turns to the camera and never lets shrink below a readable size, all numbers drawn once into one texture. Body, head, tap target and numbers share one set of instance matrices, so moving a player writes sixteen numbers; a tap is answered by the instance's index, which is the roster slot. The device pixel ratio is capped at 2. Sixty frames a second on a mid-range phone is the design target; it has not been measured on one.
- **Camera.** Side-on, top-down, behind the goal nearer the ball, and one that stays close and keeps its aim on the ball (the aim catches up over about half a second and is held inside the pitch). Changing camera glides. `cameraFit.ts` projects the pitch corners (and marker height) through the camera and moves and zooms it until the pitch fills the canvas without cropping a touchline; the canvas takes the fitted pitch's shape within limits (1.25 to 2 wide per unit of height), and side-on looks down more steeply on a narrow screen. Turning needs Ctrl or Cmd with a mouse, or two fingers on a touch screen, so page scroll is never taken.

## Pro matches and watching as live

`/pro` and `/pro/:matchId` (public, lazy) read the 115 matches of the 2018 World Cup and Euro 2016 from `public/data/pro/`. The files are written by `research/pro/build.py` and their format is a contract (`research/pro/CONTRACT.md`): integer tuples per event, about 48 kB a match, validated with zod when read. The pipeline also writes reference numbers from the raw data (`research/out/pro_golden.json`), and the TypeScript in `src/engine/pro/` is held to them in tests for every match: events, passes, shots, goals, corners and chance quality, plus the passing networks of the two finals.

- **One engine.** `toReview.ts` maps provider events to the kinds a coach taps (goal, shot, corner, entry into the box, ball won high, ball lost in own half), so "who was on top" and the shot map are the coach's own components reading a professional match. The mapping rules (what counts as a turnover, where the box starts, how an own goal is counted) are written at the top of that file.
- **As live.** `live.ts` turns the periods into one running clock and returns the events up to a playhead by binary search. The screen keeps one number, the playhead, and every section is a pure function of "the events so far": the score comes from the goals so far, the race stops at the playhead, the network and territory use only earlier passes. Playback advances the playhead from animation frames and updates the page a few times a second; it pauses when the tab is hidden and does not auto-play under reduced motion.
- **The live match centre** (`src/features/momentum/LiveCentre.tsx`) is the same idea for a coach's own match: a pure `liveSnapshot` of the events read so far, redrawn whenever the live feed says something changed. It cannot know the clock on the recording phone, so its "now" is the newest event.

## Knowing when it breaks

- **Uptime:** a scheduled workflow asks `/api/health` once an hour. The endpoint makes a round trip into Postgres and asks the sign-in service, so "up" means a coach could sign in and save, not that a static file was served.
- **Errors in the field:** a route-level error screen and an app-level boundary replace a blank page with what happened and two ways forward, and file a report. The report is built by a pure function (`src/lib/report.ts`): ids, e-mail addresses and long numbers are scrubbed, the route is a pattern, and the same bug gets the same fingerprint. Uncaught errors and unhandled rejections go the same way.
- **A release while the app is open:** when a screen's code is gone because a new release replaced it, the page reloads itself once per tab and says the app was updated.
- **Limits:** reports come from every page, signed in or not. The database takes twenty an hour per account and sixty an hour from all signed-out pages together, drops the rest quietly, and keeps a report thirty days. The app cannot read them back.

## Decisions

Recorded in `docs/adr/`. The short version: no application server, no ORM, no chart library, no state-management library, no forecaster. Each is absent because the product does not need it, and each absence removes something that could fail.
