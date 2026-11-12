# Building a feature in Klupa

Read `CLAUDE.md` and `docs/DESIGN.md` first. This page is the contract every feature follows so features can be built independently and still fit together.

## Ownership

A feature owns exactly:

- `src/features/<name>/**` (components, `routes.tsx`, `api.ts`, tests)
- `src/i18n/locales/bs/<name>.json` and `src/i18n/locales/en/<name>.json`, each one object with the single top-level key `<name>`. Identical key sets in both languages. Use it as `t('<name>.some.key')`.

Nothing else is edited. No new dependencies. No git commands.

## What is already there

- **UI kit:** `import { Button, LinkButton, Card, CardTitle, TextField, SelectField, Segmented, StateBadge, Pill, Stat, PageHeader, EmptyState, ErrorNotice, Skeleton, SkeletonText, Spinner, Sheet, useToast, DataTable, Reveal, RevealList } from '../../ui'`. Read the component files for props. Compose them; do not restyle them or use raw palette classes. Tokens: `paper raised ink ink-soft line pitch pitch-soft amber amber-soft clay clay-soft mute mute-soft home away on-ink`, `rounded-card`, `rounded-control`, `shadow-float`, `ease-touch`, `font-display`. Icons from `lucide-react`. Motion from `motion/react` (the app root sets `reducedMotion="user"`).
- **Session and club:** `useActiveClub()` from `src/lib/club` gives `{ clubId, clubName, isDemo, role, teamId, teamName, ageGroup }`. Screens under the app shell always have one.
- **Shared reads:** `usePlayers()`, `useMatches()`, `useSessions()` and `queryKeys` from `src/lib/data`.
- **Database:** `supabase` and the `Row<'table'>` / `Enums` types from `src/lib/supabase`. The schema is in `supabase/migrations/` and typed in `src/lib/database/` (generated; regenerate with `npm run db:types`).
- **Engines:** `src/engine` (momentum, opportunity, planner, load, resources, xg). Pure functions; call them from components, never re-implement them.
- **Errors:** `errorKey(error)` from `src/lib/errors` returns a translation key; show it with `toast({ tone: 'error', message: t(errorKey(error)) })`.

## Rules

1. **Routes:** `routes.tsx` exports `<name>Routes: RouteObject[]` with absolute paths. The page component is the element; each page starts with `<PageHeader>`.
2. **Data access:** all Supabase calls live in the feature's `api.ts` as small async functions that name their columns, set a `.limit()`, always filter by `club_id`, and throw the Supabase error. Components use TanStack Query (`useQuery` / `useMutation`) around them and invalidate the relevant `queryKeys` after a write. `api.ts` holds no logic.
3. **States:** every screen handles loading (`Skeleton`), empty (`EmptyState` with the next action), error (`ErrorNotice` with retry) and success.
4. **Forms:** validate before sending; show the reason next to the field; disable nothing silently.
5. **Text:** no user-facing string in a component. Dates and numbers through `Intl` with `i18n.language` (for Bosnian decimals use the `formatXg` approach in `src/features/momentum/chartModel.ts`).
6. **Accessibility:** real headings in order, labels on every control, 44 px targets, no colour-only meaning, keyboard reachable.
7. **Tests:** Vitest + Testing Library, behaviour not snapshots. Mock `./api`, `../../lib/data` and `../../lib/club` with `vi.mock`; wrap renders in `QueryClientProvider`, `ToastProvider` and a `MemoryRouter`. Cover loading, empty, error, the main success path and each validation. Aim for 90% of lines in your folder (excluding `api.ts`).
8. **Code:** strict TypeScript, no `any`, no non-null assertions, no `console`, no `TODO`, files under 300 lines, comments say why.

## Verify (only your own files; others are working in parallel)

```
npx prettier --write src/features/<name> src/i18n/locales/bs/<name>.json src/i18n/locales/en/<name>.json
npx tsc --noEmit
npx eslint src/features/<name> --max-warnings 0
npx vitest run src/features/<name> src/i18n
```

Do not run `npm run verify` or the coverage command. If `tsc` reports errors in files you do not own, say so and carry on.
