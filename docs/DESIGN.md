# Klupa design system

Quiet and exact. A grey page, white tiles, one typeface, ink for actions, and colour kept for meaning. The product's own graphics (the 3D replay, a scoreboard, the season rings) are the only loud things on a screen, and they sit on black. Built for one thumb, in bad light, with a match going on. The bar is a first-party phone app.

## Principles

1. **One answer per screen.** Lead with the conclusion a coach can act on. Detail is one tap away, never in the way. Today answers "where does the team stand and what do I do next" in five seconds.
2. **Colour is a claim.** Green, amber and clay mean "stable", "depends on one chance" and "depends on the window" everywhere. They are never decoration, and never the only cue: every colour has a label, an icon, a shape or a position.
3. **Numbers carry their doubt.** A rate is shown with how much was observed. An estimate is labelled an estimate. A measure with nothing behind it says "Not yet", never 0%.
4. **Motion explains.** Things move to show where they came from or what changed: a ring sweeping to its value, a highlight sliding to the tab you chose, a sheet rising from the bottom edge. Nothing bounces or delays a tap. The one film on the site (the replay on the landing page) can be paused, and all motion is off when the device asks for reduced motion.
5. **Thumb first.** Primary actions sit in the bottom third on a phone. Touch targets are at least 44 px. Tables become cards below 640 px.
6. **Nothing for show.** No gradients, no glass, no glow, no decorative icons in coloured boxes, no badges that say nothing, no capitals for emphasis. If an element does not carry information or an action, it is not there.

## Tokens (defined once in `src/index.css`)

| Token          | Light                 | Dark                  | Use                                             |
| -------------- | --------------------- | --------------------- | ----------------------------------------------- |
| `paper`        | `#F5F5F7`             | `#000000`             | Page background                                 |
| `raised`       | `#FFFFFF`             | `#1C1C1E`             | Tiles, sheets                                   |
| `ink`          | `#1D1D1F`             | `#F5F5F7`             | Text, primary buttons                           |
| `ink-soft`     | `#636366`             | `#A1A1A6`             | Secondary text                                  |
| `line`         | `#D2D2D7`             | `#38383A`             | Rules, field borders                            |
| `hairline`     | black at 8%           | white at 8%           | Bar edges, dividers inside a tile               |
| `chrome`       | `#FAFAFC`             | `#161618`             | Tab bar, rail, public header (opaque)           |
| `pitch`        | `#0A6E3C`             | `#30D158`             | Brand, links, "stable"                          |
| `pitch-soft`   | `#E3F3EA`             | `#0F2E1B`             | Tinted surfaces                                 |
| `amber`        | `#B86E00`             | `#F0A93B`             | "Depends on one chance", caution                |
| `clay`         | `#B93A26`             | `#F0705C`             | "Depends on the window", destructive            |
| `mute`         | `#636366`             | `#98989D`             | "Level", disabled, chevrons                     |
| `mute-soft`    | `#E8E8ED`             | `#2C2C2E`             | Secondary buttons, the segmented control's well |
| `home`, `away` | `#1D4ED8` / `#7C3AED` | `#7AA2FF` / `#B79CFF` | Our team and the opponent in charts             |
| `ring-*`       | fair / seen / effort  | lifted for black      | The three season rings only (see below)         |
| `stage`        | `#000000`             | `#000000`             | The black tile (see below)                      |

All text and control colours meet WCAG 2.2 AA on their surface in both themes; ring arcs and chart marks meet 3:1 (WCAG 1.4.11).

## The stage

`Stage` (`src/ui/Stage.tsx`) is a black tile, the same in both themes, for the product's own graphics: the scoreboards in the tagger, the live match centre, a match review and a professional match; the season rings on Today; the film of the 3D replay on the landing page. The `stage` utility re-points the colour tokens for everything inside it (ink becomes near-white, secondary surfaces become translucent white, the chart colours are lifted), so a button, a pill or a chart placed on a stage needs no stage-specific style. A screen has at most one or two stages; a page of them would be as flat as a page with none.

## Type

One variable family, **Archivo**, self-hosted, at its natural width. Size and weight carry the hierarchy; nothing is condensed and nothing is set in capitals.

- **Large title** (`font-title text-large-title`): weight 650, 34 px on a phone and 48 px from 640 px, tracking −0.028 em, balanced lines. One per page, from `LargeTitle`. The landing page's headline uses the same cut at 44 to 88 px.
- **Display** (`font-display`, big numbers): weight 700, tracking −0.035 em.
- **Score** (`font-score`): weight 700, tracking −0.045 em, the largest type on any screen.
- **Body**: weight 400 and 600, 16 px with 1.47 line height.
- Numbers always use tabular figures so columns and counters do not jitter.

Scale tokens: `text-large-title` 34, `text-title` 22, `text-headline` 17, `text-body` 16, `text-footnote` 13, `text-caption` 12. Long Bosnian words break with `overflow-wrap` rather than widening a tile.

## Shape, depth and material

Radius 22 px for tiles, 28 px for a stage, 12 px for fields, full for buttons and pills. Tiles use one recipe (`SURFACE` in `src/ui/internal.tsx`): `raised` on `paper`, with no border and no shadow; the step in lightness is the edge. Tappable tiles lift to `shadow-lift` on hover. Only floating things (sheets, toasts) cast `shadow-float`. The tab bar, the rail and the public header are opaque `chrome` with a hairline. The primary button is ink; the secondary button is a grey pill. No gradients on any surface.

## Motion (`src/ui/internal.tsx`)

| Name            | Value                            | Use                                      |
| --------------- | -------------------------------- | ---------------------------------------- |
| `PRESS`         | scale 0.97, 120 ms in, 75 ms out | Every tappable surface                   |
| `SPRING.snappy` | stiffness 520, damping 42        | Segmented thumb, tab highlight           |
| `SPRING.settle` | stiffness 260, damping 30        | Toasts, content arriving                 |
| `SPRING.draw`   | stiffness 70, damping 18         | Rings and sparklines drawing their value |
| `ease-spring`   | the settle spring sampled to CSS | Sheets and the page settle (CSS-driven)  |
| `DURATION`      | quick 120, base 220, slow 420 ms | Fades, count-ups                         |
| `STAGGER`       | 40 ms per sibling, capped at 6   | Lists and page blocks                    |

Every spring is critically damped or close to it: things arrive and stop. A new page **settles**: each top-level block rises 6 px and fades in 40 ms after the one before (`page-settle`, keyed by route so it runs once). Charts and rings draw once, the first time they are 40% on screen, and never loop. With reduced motion everything is simply drawn in its final state.

## Components (in `src/ui/`)

Existing: `Stage` (above), `Button` (`primary`, `secondary`, `tinted`, `ghost`, `danger`), `LinkButton`, `Card`, `TextField`, `SelectField`, `Segmented`, `StateBadge`, `Pill`, `Stat`, `PageHeader`, `EmptyState`, `ErrorNotice`, `Skeleton`, `Sheet`, `Toast`, `DataTable`, `Reveal`.

Added for Today and available everywhere:

- `LargeTitle` — eyebrow, the page's `<h1>`, subtitle, actions. `PageHeader` is built on it.
- `SectionHeader` — a section's `<h2>`/`<h3>`, an optional line under it and an optional "see all" link.
- `ListGroup` + `ListRow` — the standard tappable row: icon tile, title, detail, value, chevron; hairlines start where the text starts.
- `Avatar` — a shirt-number badge. Players are a label and a number, never a photo.
- `Ring` — one arc with its value inside and its label under it; one image named "label: value".
- `RingStack` — up to three concentric rings beside a legend that carries every label, value and detail. Each legend row has a position glyph (three nested circles, this ring's solid), so it reads without telling colours apart.
- `Sparkline` — a word-sized trend line that draws once and marks the latest value.
- `StateStrip` — a match as a thin bar of momentum states, with gaps at period breaks; `insufficient` is hatched.
- `KlupaMark` — the mark (below).

Feature code composes these and does not restyle them. A new visual pattern is added here first.

## The Today rings

Three measures, outermost first, each a share in [0, 1] computed in `src/app/home/model.ts`:

| Ring            | Token         | Measure                                                      | Explained on     |
| --------------- | ------------- | ------------------------------------------------------------ | ---------------- |
| Fair minutes    | `ring-fair`   | 1 − Gini of match minutes over the whole squad (zeros count) | `/fairness`      |
| Observed        | `ring-seen`   | Share of the squad with at least 5 observed attempts         | `/fairness`      |
| Effort recorded | `ring-effort` | Share of present training minutes that have an effort rating | `/fairness/load` |

Ring colours name a measure, not a verdict, so they stay clear of amber and clay. A ring with nothing behind it shows a dashed track and "Not yet".

## Identity

The mark is a park bench seen from the front, reduced to a few round-capped strokes (two backrest slats, the seat, two posts, two splayed legs) in white on a `pitch` tile. The geometry lives once in `MARK_STROKES` (`src/ui/Mark.tsx`); `public/icons/icon.svg` and `icon-maskable.svg` draw the same strokes, and a test fails if they drift. PNG icons (192, 512, maskable 512, apple-touch 180) are rendered from the SVGs by `node scripts/icons/render-icons.ts` with Playwright's Chromium.

## Installable and offline

`public/manifest.webmanifest` makes Klupa installable (standalone, `paper` theme and background). `public/sw.js` is a small hand-written worker: nothing precached by name; navigations network-first with the last good page kept as the app shell; same-origin `/assets/`, `/icons/`, `/models/`, `/vision/` and `/data/` cache-first; Supabase and every other origin never touched; one versioned cache family cleaned on activate. The rules live in `cacheStrategy` (`src/app/swPolicy.ts`); the worker carries a copy, and a test runs both on the same cases. It is registered from `src/app/registerServiceWorker.ts` in production builds only.

## Writing

Plain words, second person, sentence case. Say what the coach can do next, with the number that justifies it. When nothing needs attention, say so; never invent urgency. Bosnian first, English second; no string lives in a component.
