# Changelog

All notable changes are listed here. Versions follow semantic versioning.

## Unreleased

## 0.4.1 · 12 November 2026

- Changing the match on the replay page or the view on the fairness page no longer moves keyboard focus to the top of the page. The page-change announcement took it; now focus stays on a control that is still there. Found by the independent re-score of this release.
- The README answers the jury's five criteria one by one, each with where to see it, and the readiness record has the scan of this release: 100 of 100, 91 of 91 checks passed.
- An exported function the replay no longer used is removed, the README says where the front-page film comes from (a recording of the app's own 3D replay), and the page fallback leaves `/media/` alone. All three came from re-running the readiness scan's checks on release 0.4.0.
- Bosnian, after an independent read of every string: 69 corrected. The offline chip said "Bez veze", which reads as "pointless", and now says "Van mreže"; "Izjednačeno" beside a 2:1 score is "Ravnopravno"; the matches screens address the coach as "vi" like the rest of the app, with no gender; "1 udaraca" and "1 sati" can no longer be printed.
- The status page writes its date from the app's own Bosnian tables, so no browser prints "2026 M11 12".
- The header of the open pages is the name and the links. The tagline was cut short in Bosnian once the links arrived.
- On a phone the planner's save button is the last thing in the form. It was a bar floating over the form, and in Bosnian it hid a field.
- In dark mode the black tiles (scoreboards, rings, the replay) have a faint edge, so they are tiles on a black page and not text in space.
- The large scoreboards write a score one way, "4 : 2". On the professional matches the dash touched both digits.
- On a slow phone the player overlay rests after each analysis for as long as the analysis took, so Stop, Pause and the layer switches answer at once instead of after several seconds. It analyses about half as many frames there; a fast phone is not affected.
- The overlay says "1 frame a second" where it said "1 frames", with the Bosnian forms for one, a few and many, and its privacy line says exactly what stays on the device: no frame, clip or number read from the picture.

## 0.4.0 · 12 November 2026

- Player overlay, a new open page at `/overlay`: pick a video of a match or open the camera, and every player is found, followed with a number of their own and marked by team over the picture, with a count of each team in view. It runs on the device; nothing is uploaded, and a browser test checks that. It shows where players are in the picture, not on the pitch, and says so.
- The match replay draws players as figures that face the way they run and lean into a sprint, on a pitch lit like a night match in both themes. A fourth camera follows the ball, a sprinting player stands on a larger white plate, the ball leaves a short tail, the chosen player's speed is written on the picture, and the space-control layer has a smooth border between the teams.
- On the replay page, Bosnian dates no longer print as "2023 M05 27" in browsers without Bosnian data, the two team columns stay level when a club name wraps, each team stays on a line with its share of the pitch, and the match picker uses short club names so it is not cut on a phone.
- The vision library used by Shot lab and the Player overlay reports usage counters to its maker and has no switch for it. The page now refuses that request itself, wherever it is served; until now only the site's security policy stopped it. A browser test leaves the page and fails if anything went to another address.
- Moving to another page puts focus on its heading and announces it, so keyboard and screen-reader users know the page changed.
- The front page loads its headline and the sign-in form first and everything under them after; the first visit is 10 kB lighter. The film is cached like the other large files, and its pause button follows what the film is actually doing.
- Inside the code: the converter from a professional match to a coach's taps moved out of the engine, which no longer imports from any feature; the sample-season control is one component.
- The build is measured: CI prints what a first visit downloads and the largest chunk fetched on demand, and fails if either passes its budget (`npm run size`).

## 0.3.0 · 12 November 2026

- Professional matches name the teams in the reader's language (Hrvatska, Njemačka, Južna Koreja), and the search finds a team by either name.
- On a narrow phone the controls under a professional match's scoreboard wrap to a second line instead of pushing the page wide.
- A new look, on every screen: a grey page with white tiles, one typeface at its natural width, ink buttons, and colour kept for meaning. Scoreboards and the season rings sit on a black tile. Described in `docs/DESIGN.md`.
- A front page instead of a sign-in form: what Klupa is, a film of its own 3D replay that can be paused, and a tile for each thing it does, each leading into a screen anyone can open. "Try the demo club" is the main action; signing in with an emailed code is below.
- The live match centre no longer clips a long team name in the numbers table.
- The front page shows the product itself: the real live match centre fed a made-up half, the research figure read from the result file, and links to the open screens in the header.
- A demo club opens full: after "Try the demo club" and "Create club", Today loads the invented season by itself. An empty demo club offers the same as one button on Today.

- Shot lab can use the camera live: the skeleton is drawn over the picture, a small readout shows both knee angles, trunk lean and the faster foot about ten times a second, and a strike caught in the last three seconds opens as a skeleton-only result. Everything runs on the phone; nothing is recorded or sent. The site now allows the camera for itself (`Permissions-Policy: camera=(self)`).
- Pro matches: all 115 matches of the 2018 World Cup and Euro 2016 read by the engine from open event data, held to reference numbers computed separately in Python for every match. Each match has its numbers, the chance-quality race, who was on top, the shot map, a passing network, territory, each goal's build-up replayed from above or in 3D, and the players. Any match can be watched as live: play, pause, four speeds, a scrubber with the goals marked, and every section shows only what had happened by that minute.
- Match replay: seven tracked matches instead of one, each with its own address, club names instead of "home" and "away", a physical report per match, and a camera fitted to the screen so the pitch fills a phone.

- Error reports now come from every page, signed in or not, with one shared hourly allowance for signed-out pages. Each page load also sends three page-speed numbers and nothing about the person. `/api/health` carries a field pulse (error reports in the last hour and day, page-speed percentiles of the week), the monitor opens an issue when error reports spike, and `/status` shows all of it on one page.
- Live match centre: a match in progress opens on the score, who is on top as of the newest event, the counts so far and the latest events, and follows the recording phone by itself. Today leads with the live match and offers "Watch live".
- The match tagger fits one phone screen: score, clock, controls, the last event with its undo and all eight buttons, with nothing sticky and nothing overlapping.
- A new page opens at its top, and going back returns to where you were.

- A readiness record (`docs/READINESS.md`): both outside reviews, what they found and what is still open. A second load test on the release commit, with the raw summary kept.
- The prepared backup writes the accounts before the rest, the order a restore needs.
- A healthy answer from `/api/health` is kept at the edge for fifteen seconds, so the endpoint cannot be used to multiply load on the database. The pose model, the vision runtime and the tracking file are cached for a day.

- Every page has its own title in the browser tab ("Matches · Klupa"), taken from the page's heading in the coach's language. All pages used to share one.
- The monitor asks the live service once an hour instead of every thirty minutes, which halves what it spends of the free runner minutes. An outage is noticed within the hour.
- The browser tests no longer add page-speed samples and error reports to the numbers on `/status`. The secret scanner and backup images are pinned by digest, the load test's two helper libraries are kept in the repository, and Dependabot watches the Python requirements. A backup or migration run that has no secret says "skipped" in its summary.

## 0.2.0 · 12 November 2026

- Match tagger, match review, training planner, fairness, load and pitch-use screens, club and squad management.
- Expected-goals model trained on 45,287 open-data shots, with a model card.
- Momentum study repeated on 1,941 matches; the engine reproduces it count for count.
- Database with forced row-level security, audit log, write limits and retention.
- Design system, sign-in by one-time code, demo club.
- The lists of matches and of sessions are paged by key, newest first, so older ones can be reached. Screens that summarise still read the most recent fifty.
- Three features (the labs, the live feed, error reports) can be switched off in the host settings without a code change.
- The API contract, a contributing guide, a pull-request template and code owners are written down.
- Every write that touches more than one row (planning a session, a substitution, the sample season) and every erasure is now one database function, so it is stored whole or not at all. The browser issues no delete of its own.
- `/api/health` answers 200 only when the database and the sign-in service both answered.
- The signed-in browser journey is its own test project: it can no longer be skipped quietly, and CI refuses to start without its test account.
- The environment template is `env.example`, so no file named `.env*` is tracked.
- A match being recorded is followed live: the review page updates by itself on any signed-in member's phone, and says when the feed is cut off.
- Match replay: one professional match in 3D from tracking data, with team shape, space control, a player's trail, speed and distance, and a flat view when 3D is not available.
- When a screen breaks the coach sees what happened instead of a blank page, and a report without any of their data reaches us. A scheduled monitor checks the live service every thirty minutes and opens an issue when it is down.
- Creating a club and its first team is one transaction, and only a demo session gets a demo club: the database decides, not the client. Old demo accounts are purged with their clubs.
- The match review shows how each side's chances came about: after winning the ball high, after the other side lost it in its own half, after a corner, or with nothing tagged before. It names a pattern only when at least three chances exist and one lead-up is behind half of them.

## 0.1.0 · 11 November 2026

- Evidence engine and Momentum Lab on seven professional matches.
- Opportunity ledger with shrinkage.
- CI with coverage gate, lint, build and secret scan.
