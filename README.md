# SuperCoachNuffies

An AFL SuperCoach companion app for nuffies. Browse player stats, get
captain-pick recommendations, plan your trades, and import your real
SuperCoach team by uploading a screenshot — no login, no API tokens, your
screenshot stays on the device.

> **Status:** personal project, in active development. Currently iOS-first
> (free Apple ID dev signing). Android isn't tested.

---

## Table of contents

- [What it does](#what-it-does)
- [Features by tab](#features-by-tab)
- [Tech stack](#tech-stack)
- [Where AFL data comes from](#where-afl-data-comes-from)
- [Storage architecture](#storage-architecture)
- [System diagram](#system-diagram)
- [Local development](#local-development)
- [Roadmap](#roadmap)

---

## What it does

Two things the official SuperCoach site does poorly that SuperCoachNuffies wishes to improve:

1. **Captain-pick advice** — ranks every active player (or your synced team)
   by a captain rating that combines recent form, opponent average vs that
   position, the player's average at the venue, and time-on-ground. Top pick
   is your captain, second is your vice. Updated weekly with each new round.
2. **Trade advice** — two views: best players to **trade IN** (form +
   upcoming-fixture friendliness, filtered to ones not already on your team)
   and underperformers to **trade OUT** of your own squad (poor recent form,
   upcoming byes, injury status).

Both features feed off the same import: take a screenshot of your SuperCoach team
page, the app reads it locally with on-device OCR, links each player to live
stats, and unlocks personalised captain + trade recommendations.

---

## Features by tab

The bottom tab bar has five tabs. Open animation: a downward arrow ▼ on each
inactive tab flips upward ▲ in green when selected.

### 1. Players

The browse-everything tab. A scrollable list of every AFL player with one
giant horizontal sort-pill row at the top:

- **Total Pts** — total SuperCoach points this season
- **Avg** — season average
- **3 Rd Avg / 5 Rd Avg** — recent-form averages
- **Rnd Pts** — score in a specific round (the round picker lets you compare
  any one round)
- **Price** — current SC price
- **±$ Change** — week-over-week price movement
- **Own %** — community ownership
- **Breakeven** — score needed next round to maintain price

Each sort can flip ascending/descending via a circular toggle. Filters
include:

- **Position** — DEF / MID / RUC / FWD pill row
- **Price range** — dual-handle slider, $95k → $750k
- **Bye round** — multi-select, hides players with byes in those rounds
- **Owned only** — restricts to players in your imported team
- **Bubble** — rookies with ≤3 games played (the price-rise sweet spot)
- **Year picker** — 2024 / 2025 / 2026 to look at historical seasons

Search bar filters by name in real time. Tap any player → full detail page
with their score history chart and per-round breakdown.

### 2. Captains

Captain-pick recommendations for the current round. Ranks candidates by a
custom rating function (`getCaptainRating` in `src/utils/scoring.ts`) that
blends:

- **Form** — last-3 and last-5 round averages
- **Opponent matchup** — average score vs this opponent's defensive rank
- **Venue** — average score at the venue this round is being played at
- **Time on ground** — TOG % (low TOG = injury or rotation risk)

Top 30 candidates are listed. The #1 pick gets a gold "C" highlight; #2 gets
a purple "V" for vice-captain. Each card shows the projected captain score
(rating × 2). Filter by position to focus on a specific role.

If your team is imported, the list **only ranks players you actually own** —
otherwise it ranks the whole league.

### 3. Trades

Two-tab view (Trade IN / Trade OUT) with a position filter.

**Trade IN** — best players to bring into your squad. Ranks by a value score
that weighs recent form vs price (`getTradeInTargets` in
`src/utils/trade.ts`). Filters to players not already in your team.

**Trade OUT** — your underperformers. Considers:

- Recent average dropping below season average
- Upcoming byes (a player about to bye twice in the bye-round window)
- Injury / suspension status
- Negative projected price change

If your team isn't imported yet, Trade OUT shows a banner pointing you at
the My Team tab — without your squad, it can't tell you who to trade out.

### 4. Stat DNA

Statistical insight tab. Computes the correlation between every individual
SuperCoach stat (kicks, handballs, marks, tackles, hitouts, tackles inside
50, …) and total SC score, broken down by position.

Each stat is rendered as a horizontal bar:

- **Green** = boosts score, **red** = hurts score (clangers, free kicks
  against)
- Bar length = correlation strength
- Impact tag: Very High / High / Medium / Low

Switch the position pill (ALL / DEF / MID / RUC / FWD) to see how scoring
weight shifts — for example, hitouts dominate RUC scoring but barely matter
for DEF; spoils and intercept marks rank highly for DEF but not for FWD.

This is the "why is X scoring well" / "what should this player improve to
score more" tab.

### 5. My Team

Where you import your team. The screen toggles between two views:

- **Pitch** — your 31 picks rendered on a green AFL oval, grouped DEF / MID /
  RUC / FWD / FLEX with a bench panel. Tap a player to set captain, set
  vice-captain, or open their detail page.
- **List** — the same players in a vertical list grouped by position, showing
  L3 average, current price, weekly $ change, and breakeven.

**Importing**: tap **Pick Screenshot(s)** → photo picker (multi-select up to
4 images, since the SC team page is taller than a phone screen) → Process.
The app:

1. OCRs each image locally with **Google ML Kit text recognition**
2. Parses the result with bounding-box geometry (section headers tell us
   DEF/MID/RUC/FWD bands; X coordinates split field vs bench)
3. Matches each parsed player against the Footywire database via a four-tier
   strategy (exact surname+team → surname+initial → sole-surname → fuzzy
   Levenshtein)
4. Stores the match in the Zustand store → pitch and list re-render

Re-import any time via the **Re-import** button on the green sync banner.
Cleared via **Clear Imported Team** at the bottom of the list view.

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Expo SDK 54** + React Native 0.81.5 | Fast iteration, OTA-friendly, custom native modules via dev builds |
| Language | TypeScript 5.9 | |
| Navigation | **expo-router** (file-based) | Tabs are folders under `app/(tabs)/`; deep linking is free |
| State | **Zustand** + AsyncStorage hydration | Lightweight, no Provider boilerplate, persists team across launches |
| Server cache | **@tanstack/react-query** | Round-aware refetching, stale-while-revalidate for stats |
| Local cache | **expo-sqlite** (`kv_blob` table, WAL) | Per-row read for big caches (BEs, scores, projections, matchups) |
| Cloud sync | **Supabase** (Postgres + Auth) | Magic-link sign-in; one `user_teams` row per user holds the imported squad |
| OCR | **@react-native-ml-kit/text-recognition** | Local on-device, no network, no API keys |
| Charts | react-native-svg, react-native-gifted-charts | |
| Engine | Hermes, **New Architecture enabled** | |
| iOS deployment target | 15.5 (bumped for ML Kit) | |

---

## Where AFL data comes from

The only "server" the app runs is **Supabase** — and that's just for auth
and your imported team (covered in [Storage architecture](#storage-architecture)
below). Every byte of AFL stats data is fetched directly from the iPhone
to two **public third-party** sources and cached locally.

### Footywire (HTML scraping)

Public AFL stats site. The app fetches HTML pages and parses the tables in
JavaScript. Routes used (in `src/api/footywire.ts`):

- `/afl/footy/supercoach_breakevens` — breakevens, injury/suspension flags
- `/afl/footy/supercoach_round?roundid=N` — round-by-round scores
- `/afl/footy/supercoach_players_list` — full player roster with positions,
  prices, ownership
- `/afl/footy/ft_match_list?year=Y` — match list / fixture mapping
- `/afl/footy/ft_player_history?pid=...` — per-player career history

All requests go through `fetchWithRetry()` (3 attempts, exponential
backoff). Heavy payloads (per-round scores, per-player BE history,
fixture projections, matchup history) are cached in SQLite for 6 hours;
see [Storage architecture](#storage-architecture).

### Squiggle (JSON REST API)

Friendly community-run AFL data API at `api.squiggle.com.au`. Routes used
(in `src/api/squiggle.ts`):

- `GET /?q=games;year=Y` — full season fixture
- `GET /?q=games;year=Y;round=N` — single round
- `fetchByeRounds(year)` — derived locally from the fixture

Squiggle uses slightly different team names from SuperCoach for Brisbane and
GWS, so the module normalises them.

### Stitched together via React Query

`src/hooks/usePlayers.ts` orchestrates both sources: pulls Footywire for
player data + Squiggle for fixture/byes, builds a unified `Player[]`, and
caches it with **React Query** keyed on `[year, round]`. Stale-while-
revalidate means the UI is instant on second visit while a background
refresh keeps data fresh. Other hooks (`useRoundScores`, `useCurrentRound`)
re-use the same React Query setup.

The screenshot side-path is independent: it never hits the network. ML Kit
runs locally; matched player IDs are then resolved against the **already-
fetched** React Query cache.

---

## Storage architecture

Three layers, each with one job:

| Layer | Backend | Holds | Why this tool |
|---|---|---|---|
| **Cloud** | Supabase (Postgres + Auth) | One `user_teams` row per signed-in user, holding the imported squad as JSON | Sign in on a second iPhone with the same email and your team appears. Row-Level Security gates access — no backend code to write. |
| **Local KV** | AsyncStorage | Imported team IDs (starters, bench, emergencies, captain, vice), per-position SC roles | Small, written on every interaction, doesn't need queries |
| **Local cache** | SQLite (`expo-sqlite`) | Per-player breakevens, per-round scores, fixture projections, matchup history | One row read per lookup instead of parsing a 789-entry JSON map every player tap |

### Cloud (Supabase)

`src/api/supabase.ts` exposes a singleton client; `src/api/teamSync.ts`
wraps it with two operations:

- **`pushTeam(snapshot)`** — upserts the current squad into `user_teams`
  after a successful screenshot import.
- **`pullTeam()`** — reads the cloud snapshot on cold start and merges it
  over local state (cloud wins on conflict).

Schema:

```sql
create table public.user_teams (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  team_data  jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.user_teams enable row level security;
create policy "owner-rw" on public.user_teams
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

Auth is **email magic-link** (`supabase.auth.signInWithOtp`). The
unsigned-in state shows `<AuthScreen />` from `app/_layout.tsx`; the rest
of the app mounts once a session exists.

### Local KV (AsyncStorage)

A handful of keys hold the imported team plus a couple of small flags
(`src/store/useAppStore.ts`):

- `myTeamIds`, `myBenchIds`, `myTeamScPositions`, `myTeamEmgIds` — the
  squad imported from a screenshot
- `captainId`, `vcId` — current week's captain / vice

Hydration runs on cold start before the first render; writes are
fire-and-forget on every interaction. After hydrate, the store calls
`pullTeam()` and merges the cloud snapshot on top, so the same login on a
second device populates the squad without a re-import.

### Local cache (SQLite)

A single `kv_blob` table backs every heavy cache (`src/store/db.ts`):

```sql
create table kv_blob (
  key        text primary key,
  value      text not null,         -- JSON payload
  updated_at integer not null       -- epoch ms
);
create index idx_kv_blob_updated on kv_blob(updated_at);

pragma journal_mode = WAL;
```

Keys are namespaced by a short prefix so caches don't collide and a whole
namespace can be wiped in one statement with `cache.deleteByPrefix("be:")`:

| Prefix | Holds | Where |
|---|---|---|
| `be7:` | Per-player round-by-round breakevens (versioned — bump prefix to invalidate every cached row) | `src/api/footywire.ts` |
| `rs:`  | Per-round score map keyed `rs:{year}_{round}` | `src/hooks/useRoundScores.ts` |
| `fx:`  | Fixture projections (opponent + venue averages) per player + round | `src/hooks/usePlayers.ts` |
| `mu:`  | Matchup history (player vs opponent / venue) | `src/hooks/usePlayers.ts` |

Read path: `cache.getJson(key)` deserialises a single row. Write path:
`cache.setJson(key, value)` upserts with the current timestamp. Stale data
is detected with `cache.isFresh(key, maxAgeMs)`.

Wins over the previous AsyncStorage-only setup:

- Lookups read **one row**, not the whole 789-entry breakeven map
- TTL lives next to the row (`updated_at`), not embedded in each payload
- Whole namespaces invalidate by prefix in a single SQL statement

---

## System diagram

```
                ┌────────────────────────── Cloud ──────────────────────────┐
                │  Supabase: auth (magic link) + user_teams (team JSON)     │
                └─────────────────────────────┬─────────────────────────────┘
                                              │ pull on cold-start
                                              │ push on import
┌─────────────────────────────────────────────┼─────────────────────────────┐
│                                          iPhone                            │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │   Tabs:   Players │ Captains │ Trades │ Stat DNA │ My Team           │ │
│  └─────────┬──────────────────────────────────────────────┬─────────────┘ │
│            ▼                                              ▼               │
│  ┌──────────────────┐                          ┌──────────────────────┐   │
│  │  Zustand store   │◀── persist (small KV) ──▶│  AsyncStorage        │   │
│  │  filters, team,  │                          │  team IDs, captain,  │   │
│  │  captain, VC     │                          │  vice, SC positions  │   │
│  └────────┬─────────┘                          └──────────────────────┘   │
│           ▼                                                               │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │  React Query  (stale-while-revalidate, in-memory)                 │    │
│  │  keyed on [year, round]                                           │    │
│  └────────┬──────────────────────────────────┬──────────────────────┘    │
│           ▼                                   ▼                           │
│  ┌────────────────┐                  ┌─────────────────┐                  │
│  │  footywire.ts  │                  │  squiggle.ts    │                  │
│  │  (HTML scrape) │                  │  (JSON REST)    │                  │
│  └────────┬───────┘                  └────────┬────────┘                  │
│           │  persist payloads                 │  persist payloads         │
│           └──────────────────┬─────────────────┘                          │
│                              ▼                                            │
│             ┌──────────────────────────────────┐                          │
│             │   SQLite kv_blob  (local cache)   │                          │
│             │   be7: / rs: / fx: / mu: prefixes │                          │
│             └──────────────────────────────────┘                          │
└────────────────────────────────────────────────────────────────────────────┘
                  │                                     │
                  ▼                                     ▼
         footywire.com.au                     api.squiggle.com.au
         (public AFL stats)                   (public fixture API)


              Screenshot import — independent path
              ──────────────────────────────────────
                         Camera Roll
                              │
                              ▼
              expo-image-picker (multi-select)
                              │
                              ▼
              ML Kit text-recognition (on-device)
                              │
                              ▼
              teamScreenshotParser + tier matcher
                              │
                              ▼
                       Zustand store ──▶ AsyncStorage  (local persist)
                              │
                              └────────▶ Supabase pushTeam()  (cloud)
```

The two halves of the app touch each other only through the Zustand store:
the screenshot pipeline writes `myTeamIds` / `myBenchIds` /
`myTeamScPositions`; the views read from there and pull matching player
records out of the React Query cache.

---

## Local development

### One-time setup

You need: macOS, Xcode (for iOS), Node 20+, an iPhone running iOS 15.5+, a
Lightning/USB-C cable, and a free Apple ID.

```sh
git clone https://github.com/fangethan/SuperCoachNuffies.git
cd SuperCoachNuffies
npm install
```

### First build to your iPhone

1. Plug iPhone into Mac via USB. On the phone, tap **Trust This Computer**.
2. On the phone, enable Developer Mode: **Settings → Privacy & Security →
   Developer Mode → On → restart**.
3. Open the workspace in Xcode:
   ```sh
   open ios/SuperCoachNuffies.xcworkspace
   ```
4. Select your iPhone in the device picker (top of the Xcode window).
5. **Signing & Capabilities** tab → ✅ Automatically manage signing → **Team:
   Personal Team**.
6. ▶ Run (Cmd+R). First build takes ~5 minutes.
7. On the phone, the first launch will fail with "Untrusted Developer".
   **Settings → General → VPN & Device Management → tap your Apple ID →
   Trust**. Re-launch the app from the home screen.

### Day-to-day JS reloads

After the dev build is installed, you don't need the cable for JS-only
changes:

```sh
npx expo start
```

Open the **SuperCoachNuffies** app on your iPhone (the one with the Nuffie
icon — *not* Expo Go). It auto-connects to Metro on the same Wi-Fi. Save a
file in your editor → app hot-reloads in under a second.

### When you need a native rebuild

- New native package installed (e.g. `npm install @some/native-thing`)
- `app.json` changes (icons, permissions, scheme)
- Anything inside `ios/` or `android/`
- The free 7-day signing cert has expired

→ Rerun `npx expo run:ios --device`.

---

## Roadmap

These are tracked separately and will land as their own PRs:

- **CI safety net** — GitHub Actions PR check: `tsc --noEmit`, ESLint,
  Jest unit tests for the screenshot parser. Gates merging to `main`.
- **Sentry** — drop-in RN SDK for crashes, JS errors, breadcrumbs around
  Footywire/Squiggle calls and the screenshot import path. Replaces the
  silent `try/catch` blocks in `src/api`, `src/hooks`, and `src/store`.
- **EAS Update / EAS Build** — over-the-air JS updates and cloud iOS
  builds for TestFlight.

---

## License

Personal project. No license granted.
