# The Daily Tailor

Personal one-page morning paper, tailored to you — web app for Alessandro Armiento.

**Product name (locked):** The Daily Tailor.

## Provenance

Inspired by news/coverage about someone who built a personal one-page morning newspaper (seen via Instagram as a story about that project — not the app itself in-feed). This is Alessandro’s own remake with his sections and integrations, not a claim of original invention.

## What it is

A **web app** whose main page is the newspaper. Read it on **iPhone** (scrollable, touch-friendly). Print / Save as PDF is hard-locked to **exactly one A4 page** — never page 2.

Sections:

1. **Today’s weather** — Open-Meteo for Roma (no API key). Mock fallback on failure.
2. **Agenda** — compact upcoming-days widget. Mock calendar + EventKit adapter stub.
3. **World news** — BBC World RSS by default. Mock fallback. Capped for one-page print.
4. **Apple Reminders** — mock adapter (no EventKit on cloud). Swap later on Mac.
5. **Action emails** — mock “yesterday” emails that imply a to-do. Swap later with IMAP/Gmail/Apple Mail.

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
| `WEATHER_CITY` / `WEATHER_LAT` / `WEATHER_LON` | Roma | Open-Meteo |
| `NEWS_FEED_URL` | BBC World RSS | Any RSS URL |
| `NEWS_MAX_ITEMS` | `5` | Print budget |
| `REMINDERS_SOURCE` / `REMINDERS_MAX_ITEMS` | `mock` / `5` | |
| `ACTION_EMAIL_SOURCE` / `ACTION_EMAIL_MAX_ITEMS` | `mock` / `4` | |
| `CALENDAR_SOURCE` / `CALENDAR_HORIZON_DAYS` / `CALENDAR_MAX_EVENTS_PER_DAY` | `mock` / `4` / `2` | |
| `NEWSPAPER_TIMEZONE` | `Europe/Rome` | |

## Adapters (next on Mac)

- Reminders → `RemindersAdapter` (EventKit / Shortcuts / AppleScript)
- Action emails → `ActionEmailAdapter` (IMAP / Gmail / Apple Mail), yesterday + actionable only
- Calendar → `CalendarAdapter` (EventKit / CalDAV)

Stubs: `src/lib/reminders/eventkit-stub.ts`, `src/lib/action-emails/imap-stub.ts`, `src/lib/calendar/eventkit-stub.ts`.

## Stack

Next.js, TypeScript, Tailwind CSS.
