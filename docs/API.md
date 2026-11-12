# API contract

Klupa has no application server. The browser talks to two things: the database's REST interface (tables and functions in the `public` schema, every one behind row-level security) and one edge function, `/api/health`. This page is the contract between the client and those two. The generated types in `src/lib/database/` are the machine-readable form of the same thing.

## Rules that hold everywhere

- **Who you are decides what you see.** Every request carries the session of the signed-in coach. A row of another club is not refused with an error: it does not exist for you. Signed-out visitors can call `health`, `field_pulse`, `report_client_error` and `report_vitals`, and nothing else: one answers "up", one answers with counts, and two only accept a report.
- **Every list has a limit and an order.** No call returns a table. Lists that can grow without bound are paged by key (see below).
- **Writes of more than one row are functions.** One function call is one transaction. The client never strings writes together and never issues a delete (decision 0007).
- **Retrying is safe where a phone might retry.** An event carries a `client_id` minted on the phone; sending it twice stores it once.
- **Column names are the wire format.** `snake_case`, dates as `YYYY-MM-DD`, times as ISO 8601 with a zone, chance quality as whole numbers of 1/10,000 of a goal.

## Functions

All are called as `POST /rest/v1/rpc/<name>` with a JSON body of the named arguments.

| Function              | Arguments                                                                                      | Returns                  | What it does                                                                                                                                                                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `health`              | none                                                                                           | `{ status, checked_at }` | Round trip into the database. Open to signed-out visitors, like the three report and pulse functions below.                                                                                                                                                  |
| `create_club`         | `club_name`, `team_name?`, `team_age?` (`demo?` is accepted and ignored)                       | club id                  | Club, owner membership and first team in one transaction. A demo session gets a demo club; nobody else can. Five clubs per account.                                                                                                                          |
| `plan_session`        | `target_club`, `target_team`, `plan: { session, drills[], player_ids[] }`                      | session id               | Session, its drills in order, and an `expected` attendance row per player.                                                                                                                                                                                   |
| `record_attendance`   | `target_club`, `target_session`, `target_player`, `new_status`, `new_minutes?`, `new_rpe?`     | nothing                  | Stores or corrects one player's attendance. Leaving out minutes or effort stores "not recorded".                                                                                                                                                             |
| `record_observation`  | `target_club`, `target_session`, `target_player`, `skill_key`, `new_attempts`, `new_successes` | nothing                  | Stores or corrects one tally.                                                                                                                                                                                                                                |
| `apply_lineup`        | `target_club`, `target_match`, `changes[]`                                                     | steps applied            | Each step is `{ type: "on", player, period, on_seconds }`, `{ type: "off", stint, off_seconds }` or `{ type: "remove", stint }`. All steps or none. Sixty steps at most.                                                                                     |
| `import_season`       | `target_club`, `target_team`, `season: { players[], matches[], sessions[] }`                   | counts                   | A whole season. Players are referred to by their place in the list. At most 40 players, 20 matches, 60 sessions.                                                                                                                                             |
| `erase_player`        | `target_club`, `target_player`                                                                 | nothing                  | Erasure. The player's events stay with the match, detached from the person.                                                                                                                                                                                  |
| `delete_club`         | `target_club`                                                                                  | nothing                  | The club and everything it holds. Owners only.                                                                                                                                                                                                               |
| `export_club_data`    | `target_club`                                                                                  | one JSON document        | Everything the club holds, for the owner.                                                                                                                                                                                                                    |
| `report_client_error` | `error_name`, `error_message`, `error_route`, `app_release`, `error_fingerprint`               | nothing                  | Files one error report, signed in or not. About twenty an hour per account and sixty an hour from all signed-out pages together (the count is checked before the insert, so two at the same instant can both pass); over that the report is dropped quietly. |
| `report_vitals`       | `page_route`, `app_release`, `lcp?`, `inp?`, `cls?`                                            | nothing                  | Files one page-speed sample for a page load: milliseconds to the largest paint, milliseconds of the slowest interaction, layout movement times 1,000. Signed in or not; 1,200 an hour for the whole site; an implausible sample is dropped quietly.          |
| `field_pulse`         | none                                                                                           | one JSON document        | Counts of error reports (last hour, last day, distinct kinds) and the 75th percentile of the page-speed samples of the last seven days. Counts and percentiles only; anyone may ask.                                                                         |

## Tables read directly

`clubs`, `club_members`, `teams`, `players`, `matches`, `match_events`, `stints`, `sessions`, `session_drills`, `session_attendance`, `observations`, `data_requests` and `audit_log` are read with `GET /rest/v1/<table>` and the columns named. Single-row writes go the same way (`POST`, `PATCH`), limited to the columns a role may change: for example, on a recorded event only `deleted_at` can be updated, which is how undo works. `client_errors` and `client_vitals` cannot be read or written by the app at all.

## Paging

The two lists a coach scrolls, matches and training sessions, are paged by key, newest first: a page is the rows strictly older than the last row of the page before, by date and then id. The client asks for one row more than a page so it knows whether another page exists. There are no page numbers and no offsets, so a match recorded while someone is scrolling never shifts or repeats a row. Screens that summarise (Today, the planner's match picker, the pitch-use view) read the most recent fifty matches and sessions; the fairness ledger and the load view read the team's whole history; the activity log shows the latest hundred entries.

## Errors

The database answers with a five-character code. The client maps them to a sentence in both languages (`src/lib/errors.ts`) and never shows the raw text.

| Code    | Meaning                                                                                                                                               | What the app does                                      |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `42501` | Not allowed, or the row is not yours or not there                                                                                                     | "You do not have permission to do that."               |
| `54000` | A limit was reached: 600 events a minute, five clubs, an import too large                                                                             | Says so; the outbox waits a minute before trying again |
| `23514` | A rule about the data was broken: an event on a match that has not started, a status that cannot follow the current one, more successes than attempts | Shown next to the control that caused it               |
| `23505` | Already exists, for example a shirt number in the same team                                                                                           | Shown next to the field                                |
| `23503` | Refers to something that does not exist in this club                                                                                                  | Shown as "that was not accepted"                       |
| `22023` | A function was called with a shape it does not accept                                                                                                 | A programming error: the general message, and a report |

## `/api/health`

`GET /api/health` answers `200` when the database and the sign-in service both answered and `503` otherwise. A healthy answer may be up to fifteen seconds old: the edge keeps it that long, so that calling the endpoint often cannot multiply calls to the database. A failing answer is never kept. The body: `status` (`ok` or `degraded`), `commit`, `requestId`, `checkedAt`, and for `database` and `auth` whether it answered, how many milliseconds it took and, on failure, one of four fixed words (`not_configured`, `timeout`, `unreachable`, `bad_answer`). It also carries `field`, the pulse in camel case (`errors1h`, `errors24h`, `errorKinds24h`, and `pages7d` with `samples`, `lcpP75Ms`, `inpP75Ms`, `clsP75`), or `null` when the pulse could not be read; the pulse never changes the status code. It takes no input and reveals no error text.

## Changing this contract

- **Additive changes** (a new function, a new optional argument with a default, a new column) can ship at any time. The database goes first, then the client: a phone still running the previous release must keep working, because the service worker can serve the old app for a while.
- **Breaking changes** get a new function name and the old one stays for one release. `create_club` is the worked example: its `demo` argument is still accepted and ignored so that the previous release keeps working.
- **Every change is a migration** in `supabase/migrations/`, exercised from scratch in CI together with the database tests in `supabase/tests/`. After a schema change the types are regenerated with `npm run db:types`.
