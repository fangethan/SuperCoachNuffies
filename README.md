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
- [How data flows in (no backend)](#how-data-flows-in-no-backend)
- [System diagram](#system-diagram)
- [Local development](#local-development)
- [Roadmap](#roadmap)

---

## What it does

Three things the official SuperCoach site does poorly:

1. **Player stats, deeply searchable** — every AFL player with their season
   averages, last-3 / last-5 averages, round-by-round scores, price,
   projected price change, breakeven, ownership %, injury/suspension status,
   bye round. Sortable by any of these. Filterable by position, price band,
   bye rounds, "owned only", and "bubble" rookies (under 3 games).
2. **Captain-pick advice** — ranks every active player (or your synced team)
   by a captain rating that combines recent form, opponent average vs that
   position, the player's average at the venue, and time-on-ground. Top pick
   is your captain, second is your vice. Updated weekly with each new round.
3. **Trade advice** — two views: best players to **trade IN** (form +
   upcoming-fixture friendliness, filtered to ones not already on your team)
   and underperformers to **trade OUT** of your own squad (poor recent form,
   upcoming byes, injury status).

All three feed off the same import: take a screenshot of your SuperCoach team
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
| State | **Zustand** + AsyncStorage hydration | Lightweight, no Provider boilerplate, persists across launches |
| Server cache | **@tanstack/react-query** | Round-aware refetching, stale-while-revalidate for stats |
| OCR | **@react-native-ml-kit/text-recognition** | Local on-device, no network, no API keys |
| Charts | react-native-svg, react-native-gifted-charts | |
| Engine | Hermes, **New Architecture enabled** | |
| iOS deployment target | 15.5 (bumped for ML Kit) | |

---

## How data flows in (no backend)

There's **no custom backend server**. The app makes HTTP requests directly
from the iPhone to two **public third-party** data sources, then caches the
results locally. "No backend" means we don't run our own API — not that the
app works offline.

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
backoff). Player breakeven data is cached in AsyncStorage for 6 hours.

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

## System diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                              iPhone                              │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Tabs:  Players │ Captains │ Trades │ Stat DNA │ My Team │  │
│  └─────────┬───────────────────────────────────────────┬────┘  │
│            ▼                                           ▼        │
│  ┌──────────────────┐                   ┌──────────────────┐   │
│  │  Zustand store   │◀── persist ──▶   │  AsyncStorage    │   │
│  │  filters, team,  │     hydrate       │  (caches + team) │   │
│  │  captain, VC     │                   └──────────────────┘   │
│  └────────┬─────────┘                                          │
│           ▼                                                    │
│  ┌────────────────────────────────────────────────────────┐   │
│  │  React Query  (stale-while-revalidate cache)            │   │
│  │  keyed on [year, round]                                  │   │
│  └────────┬──────────────────────────────────┬─────────────┘   │
│           ▼                                   ▼                 │
│  ┌────────────────┐                  ┌─────────────────┐       │
│  │  footywire.ts  │                  │  squiggle.ts    │       │
│  │  (HTML scrape) │                  │  (JSON REST)    │       │
│  └───────┬────────┘                  └────────┬────────┘       │
└──────────┼─────────────────────────────────────┼──────────────┘
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
                       Zustand store
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
- **MMKV** — drop-in faster replacement for AsyncStorage. Migrates existing
  storage keys on first launch.
- **Supabase cloud sync** — single `user_teams` row keyed on the user's
  Supabase auth ID, holding the imported squad as JSON. Magic-link sign-in
  on first launch. Server is source of truth; same team appears on a second
  iPhone with the same email.
- **EAS Update / EAS Build** (later) — over-the-air JS updates and cloud
  iOS builds for TestFlight.

---

## License

Personal project. No license granted.
