# The Daily Tailor

Personal one-page morning paper, tailored to you — web app for Alessandro Armiento.

**Product name (locked):** The Daily Tailor.

## Provenance

Inspired by news/coverage about someone who built a personal one-page morning newspaper (seen via Instagram as a story about that project — not the app itself in-feed). This is Alessandro’s own remake with his sections and integrations, not a claim of original invention.

## What it is

A **web app** whose main page is the newspaper. Read it on **iPhone** (scrollable, touch-friendly). Print / Save as PDF is hard-locked to **exactly one A4 page** — never page 2.

Sections:

1. **Today’s weather** — Apple WeatherKit when configured; otherwise Open-Meteo (with precipitation). Mock fallback on failure. Compact precip chart under meteo.
2. **Aforisma del giorno** — one curated saying, picked deterministically by date.
3. **Agenda** — compact upcoming-days widget. Mock calendar + EventKit adapter stub.
4. **World news** — BBC World RSS by default. Mock fallback. Capped for one-page print.
5. **Apple Reminders** — mock adapter (no EventKit on cloud). Swap later on Mac.
6. **Action emails** — mock “yesterday” emails that imply a to-do. Swap later with IMAP/Gmail/Apple Mail.

## Run locally

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:3847](http://127.0.0.1:3847) on desktop or phone (same LAN / tunnel).

- **Phone:** Safari → share → *Add to Home Screen* (manifest + apple-touch-icon included; no offline PWA yet).
- **Print:** tap **Stampa** or Cmd/Ctrl+P → destination PDF/printer → one A4 sheet only.

## One-page print rule

Non-negotiable: Print/PDF must be a **single A4**.

Also: **black and white only** — white paper, black type/rules, no color fills or tinted blocks (screen matches print for consistency). Print CSS forces black text, transparent backgrounds, and `print-color-adjust: economy`.

Enforced by:

- `@page { size: A4 portrait; margin: 8mm; }`
- Print sheet `max-height` + `overflow: hidden`
- Compact print typography and denser grid
- Hard caps on list lengths (`NEWS_MAX_ITEMS`, reminders, action emails, events/day)

Screen may scroll; print must not.

## Config

Copy `.env.example` to `.env.local` for overrides:

| Variable | Default | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_PRODUCT_NAME` | `The Daily Tailor` | Masthead |
| `NEXT_PUBLIC_PRODUCT_TAGLINE` | Italian tagline below | Optional |
| `WEATHER_CITY` / `WEATHER_LAT` / `WEATHER_LON` | Roma | Location |
| `WEATHER_PROVIDER` | `auto` | `auto` \| `weatherkit` \| `open-meteo` \| `mock` |
| `WEATHERKIT_TEAM_ID` / `KEY_ID` / `SERVICE_ID` | — | Apple WeatherKit |
| `WEATHERKIT_PRIVATE_KEY` or `_PATH` | — | AuthKey `.p8` |
| `NEWS_FEED_URL` | BBC World RSS | Any RSS URL |
| `NEWS_MAX_ITEMS` | `4` | Print budget |
| `REMINDERS_SOURCE` / `REMINDERS_MAX_ITEMS` | `mock` / `4` | |
| `ACTION_EMAIL_SOURCE` / `ACTION_EMAIL_MAX_ITEMS` | `mock` / `3` | |
| `CALENDAR_SOURCE` / `CALENDAR_HORIZON_DAYS` / `CALENDAR_MAX_EVENTS_PER_DAY` | `mock` / `4` / `2` | |
| `NEWSPAPER_TIMEZONE` | `Europe/Rome` | |

## Apple Weather (WeatherKit) setup

iPhone Weather data comes from Apple’s WeatherKit. The web app cannot read the Weather app on the phone without Apple Developer credentials.

1. Apple Developer Program membership (paid).
2. [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list) → **Identifiers** → register an **App ID** / Services ID and enable **WeatherKit**.
3. **Keys** → create a key with **WeatherKit** enabled → download `AuthKey_XXXXXXXXXX.p8` (once). Note **Key ID** and your **Team ID**.
4. Put in `.env.local`:

```bash
WEATHER_PROVIDER=auto
WEATHERKIT_TEAM_ID=YOUR_TEAM_ID
WEATHERKIT_KEY_ID=YOUR_KEY_ID
WEATHERKIT_SERVICE_ID=com.your.bundle.id
WEATHERKIT_PRIVATE_KEY_PATH=/absolute/path/to/AuthKey_XXXXXXXXXX.p8
```

5. Restart `npm run dev`. Footer under meteo should show `Sorgente: Apple Weather`.

Without these keys, `auto` uses **Open-Meteo** (free, includes hourly/today precip) so the precip UI still works. Code path: `src/lib/weather/` (`WeatherProvider`, `weatherkit.ts`, `open-meteo.ts`).

## Adapters (next on Mac)

- Reminders → `RemindersAdapter` (EventKit / Shortcuts / AppleScript)
- Action emails → `ActionEmailAdapter` (IMAP / Gmail / Apple Mail), yesterday + actionable only
- Calendar → `CalendarAdapter` (EventKit / CalDAV)
- Weather → `WeatherProvider` (WeatherKit live when keyed; Open-Meteo interim)

Stubs: `src/lib/reminders/eventkit-stub.ts`, `src/lib/action-emails/imap-stub.ts`, `src/lib/calendar/eventkit-stub.ts`.

## Stack

Next.js, TypeScript, Tailwind CSS.
