# Runbook

How to release, check and recover Klupa.

## Service objectives

| Objective                             | Target                            | How it is measured                     |
| ------------------------------------- | --------------------------------- | -------------------------------------- |
| The app loads                         | 99.5% of checks in a week         | `/healthz.json` returns `status: ok`   |
| The database answers                  | 99.5% of checks in a week         | `rpc/health` returns `status: ok`      |
| Database and sign-in reachable        | 99.5% of checks in a week         | `/api/health` returns HTTP 200         |
| An event tagged online is saved       | within 2 seconds, 95% of the time | Load test, `docs/load/`                |
| An event tagged offline is never lost | 100%                              | Outbox tests; the coach sees the queue |

## How we know

Five things watch the live service, and none of them needs anyone to be looking.

| What                            | How                                                                                                                                                                                                                                                                                    | Where to read it                                  |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Is it up?                       | `.github/workflows/monitor.yml` asks `/api/health` once an hour, three tries before it calls it down. A failure e-mails the repository owners and opens (or adds to) one issue titled "Live health check is failing".                                                                  | The Monitor workflow's run history                |
| Did a screen break for someone? | The app files an error report (name, scrubbed message, route pattern, release; never record contents) through `report_client_error`, from every page, signed in or not. Twenty an hour per account, sixty an hour from all signed-out pages together, kept thirty days.                | The query below, in the database's SQL editor     |
| Is this a bad hour?             | The monitor reads the field pulse on `/api/health`: the number of error reports in the last hour. Thirty or more fails the run, e-mails the owners and opens (or adds to) one issue titled "Error reports are spiking".                                                                | The Monitor workflow's run history and summaries  |
| Did it get slower for people?   | Each page load sends three numbers (largest paint, slowest tap, layout movement) through `report_vitals`; no account, no address. `/api/health` reports the 75th percentile of the last seven days, and every monitor run writes it into its summary, so the trend is the run history. | `/status` on the live site; the Monitor summaries |
| Why did the health check fail?  | `/api/health` writes one JSON line per failed probe (`event: health.degraded`, the request id, which service did not answer).                                                                                                                                                          | The host's function logs, searched by request id  |

Availability over the last runs, as a percentage (the number the objectives above are held to):

```bash
gh run list --workflow monitor.yml --limit 168 --json conclusion --jq '[.[].conclusion] | (map(select(. == "success")) | length) * 100 / length'
```

The monitor runs once an hour, so 168 runs are a week. At that grain one failed check in a week is 99.4%: the weekly target allows none, a month of 720 checks allows three, and an outage that begins and ends between two checks is not seen. It ran every thirty minutes until 12 November 2026; hourly was chosen for cost (see Cost below).

The bad-hour alert reads a count of the last hour once an hour, so each report is looked at once; when a run starts late, reports that are by then older than an hour are missed by the alert and are still in the table. The alert fires at thirty, which is below the sixty an hour that all signed-out pages share. That is a choice with a price: one signed-out caller in a loop can raise the alarm alone. Raising it above sixty would mean a crash on the public pages alone could never raise it, and a shared allowance being used up is worth a look in itself, because real reports are dropped after it. The pulse does not yet count signed-in and signed-out reports apart (that needs a migration). Until it does, the query below tells the two apart: a flood from one caller is many reports of one error with no account (`people` is 0), a real spike has several accounts or several routes.

The errors people hit in the last day, most frequent first:

```sql
select fingerprint, name, message, route, release, count(*) as reports, count(distinct user_id) as people, max(occurred_at) as last_seen
from public.client_errors
where occurred_at > now() - interval '1 day'
group by fingerprint, name, message, route, release
order by reports desc
limit 20;
```

A fingerprint is the same for the same bug on a different match or player, because ids are scrubbed before it is computed. A report with no `user_id` came from a signed-out page. A report that names a release older than the live one is usually a phone that has not reloaded yet.

## Release

1. Open a pull request. CI must pass: verify, secrets, database.
2. Merge to `main`. Vercel builds and deploys.
3. The smoke test checks that the live site serves the commit that passed CI, that security headers are present and that the database health probe answers.
4. Tag the release (`vX.Y.Z`) and add it to `CHANGELOG.md`.

Schema changes: add a file to `supabase/migrations/`, apply it to the project, and confirm the database CI job passes. Never edit the schema in the dashboard.

## Health checks

```bash
curl -s https://<site>/healthz.json
curl -s https://<site>/api/health   # 200 and status ok, or 503 naming the service that did not answer
```

```bash
curl -s -X POST https://<project>.supabase.co/rest/v1/rpc/health -H "apikey: <publishable key>" -H "Content-Type: application/json" -d "{}"
```

The first returns the deployed commit. The second returns `{"status":"ok"}` when the database is reachable.

## Rollback

There are three ways back, from fastest to slowest. Use the first that fits.

1. **Switch the feature off.** Set `VITE_DISABLED_FEATURES` in the host (for example `labs,liveFeed`) and redeploy. The names are in `src/lib/flags.ts`: the labs, the live match feed, error reports and page-speed sampling. Nothing else changes.
2. **Go back to the previous release.** In the host's deployments list, open the last deployment that was good and promote it to production (from a terminal: `vercel rollback`). This takes seconds and involves no data. The smoke test's first step fails on the next push until `main` and the live site agree again, which is the reminder to fix forward.
3. **Undo a schema change.** Migrations roll forward: write a new migration that reverses the change. Never delete or edit a migration that has been applied. Because the database goes first and stays compatible with the previous client (`docs/API.md`), going back one app release never needs a schema change.

After any of these, write down what happened and when under an issue, so the next release starts from the facts.

## Incidents

| Symptom                                       | Likely cause                           | First action                                                                      |
| --------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------- |
| Blank page with "cannot start" in the console | Missing or wrong environment variables | Check `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in Vercel; redeploy |
| Everyone sees "You do not have permission"    | A policy or grant changed              | Run `supabase/tests/isolation.sql` against the project; revert the last migration |
| Sign-in codes do not arrive                   | Email rate limit reached               | Wait an hour or configure custom SMTP in the project                              |
| "Too many attempts" while tagging             | Write limit (600 events a minute)      | Expected under abuse; check for a stuck client                                    |
| Events show as waiting to send                | Phone is offline                       | Nothing to do; they send when the connection returns                              |
| Database paused                               | Free-tier inactivity                   | Restore the project in the Supabase dashboard                                     |

## Backups

Supabase takes daily backups on paid plans. On the free plan there are none, so the project brings its own.

- **Per club, by the owner:** Club → Privacy and data → export. One JSON document with everything the club holds.
- **The whole database, weekly:** `.github/workflows/backup.yml` dumps the account rows the memberships point at, then the app's schemas and data, into one file in the order a restore needs, encrypts the dump with a passphrase and keeps it as a workflow artifact for thirty days. It needs two repository secrets, `SUPABASE_DB_URL` and `BACKUP_PASSPHRASE`; until they are set a run ends green but does nothing, and its summary page says "skipped: secret not set". **It has not yet run against the live project, and no restore has been rehearsed.** The intended restore is: decrypt with `gpg --decrypt`, then load the file from top to bottom into a new project: accounts first, then the rest. Until that has been done once, treat it as a plan, not a procedure.
- **Migrations on merge:** `.github/workflows/deploy-db.yml` applies pending migrations when `supabase/migrations/` changes on `main`, with the same `SUPABASE_DB_URL`. Until that secret is set, a run ends green with "skipped: secret not set" in its summary, and migrations are applied by hand before the merge, as they have been so far.

## Cost

Free tiers of Vercel, Supabase and GitHub Actions. The app is static files and has no server to scale. The first paid step would be Supabase Pro for backups and no pausing.

What spends an allowance on a schedule is mostly the monitor. Each run is billed as a whole runner minute, and a private repository on the free plan gets 2,000 a month. Every thirty minutes was about 1,440 of them, which left about 560 for CI and everything else; once an hour is about 720. If faster detection is wanted without that cost, the choices are a public repository (runs on the standard runners are then free) or an outside uptime service asking `/api/health`.
