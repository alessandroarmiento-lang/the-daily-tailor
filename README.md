# The Daily Tailor

Personal one-page morning paper, tailored to you — web app for Alessandro Armiento.

**Product name (locked):** The Daily Tailor.

## Provenance

Inspired by news/coverage about someone who built a personal one-page morning newspaper (seen via Instagram as a story about that project — not the app itself in-feed). This is Alessandro’s own remake with his sections and integrations, not a claim of original invention.

## What it is

A **web app** whose main page is the newspaper. Read it on **iPhone** (scrollable, touch-friendly). Print / Save as PDF is hard-locked to **exactly one A4 page** — never page 2. Printing is **optional**: tap **Stampa** when you want; the app never auto-prints on open.

Sections:

1. **Today’s weather** — Open-Meteo (default; precip from ≥07:00). WeatherKit adapter optional. Mock fallback on failure.
2. **Aforisma del giorno** — one curated saying, picked by edition date (rolls at 06:00).
3. **Agenda** — compact upcoming-days widget. Mock calendar + EventKit adapter stub.
4. **World news** — Il Post sezione Mondo RSS (`/mondo/feed/`). Mock fallback. Capped for one-page print.
5. **Apple Reminders** — mock adapter (swap later on Mac).
6. **Action emails** — mock “yesterday” emails that imply a to-do (real account when available).

## Morning edition model (locked)

1. Every morning at **06:00 Europe/Rome**, the Mac job builds that day’s full newspaper **snapshot**.
2. The **iPhone downloads** the edition (on open / after generation) and keeps it **offline all day**.
3. When consulting on iPhone, content is served from **device local storage** (IndexedDB + Cache API), not live network fetches for the day’s paper.
4. The web app has an **edition history** (`/storia`) — past days browseable.
5. Weather stays **Open-Meteo**; email remains fundamental (real account when available).

### Server APIs

| Route | Role |
| --- | --- |
| `GET /api/morning-warm?force=1` | Build + persist today’s edition (launchd at 06:00) |
| `GET /api/edition/today` | Today’s JSON (build if missing) |
| `GET /api/edition/YYYY-MM-DD` | Dated edition from archive (today may build) |
| `GET /api/editions` | List archived editions (newest first) |

Snapshots are written under `data/editions/YYYY-MM-DD.json` (gitignored — may contain personal email/reminders). Override with `EDITIONS_DIR`.

### 06:00 generation (Mac + launchd)

1. Keep the Next app running on the Mac (`npm run dev` or `npm run start` on port **3847**).
2. Install the LaunchAgent:

```bash
mkdir -p ~/Library/Logs/the-daily-tailor
cp deploy/launchd/com.alessandro.the-daily-tailor.morning.plist ~/Library/LaunchAgents/
# Edit the script path in the plist if the repo is not at ~/Desktop/the-daily-tailor
launchctl unload ~/Library/LaunchAgents/com.alessandro.the-daily-tailor.morning.plist 2>/dev/null || true
launchctl load ~/Library/LaunchAgents/com.alessandro.the-daily-tailor.morning.plist
```

3. Manual test: `./scripts/morning-warm.sh` or `curl -s 'http://127.0.0.1:3847/api/morning-warm?force=1'`.

Set the Mac timezone to **Europe/Rome** (or accept that launchd uses the Mac clock).

### Icona Home Screen (iPhone) — un tap = edizione di oggi

1. Sul telefono apri l’URL del Mac in **Safari** (stessa Wi‑Fi / tunnel), es. `http://<mac>:3847/`.
2. **Condividi → Aggiungi a Home** (Add to Home Screen).
3. Conferma il nome **The Daily Tailor**. Compare l’icona (apple-touch-icon / manifest).
4. L’icona apre in **standalone** (`display: standalone`) la `start_url` **`/`** = edizione di oggi.
5. Alla prima apertura dopo le 06:00 (con rete): scarica `/api/edition/today`, salva in IndexedDB + Cache API.
6. Poi, anche offline: un tap sull’icona mostra la copia locale del giorno. **Stampa** resta opzionale (pulsante in-app o Condividi → Stampa del browser) — nessun auto-print.

Manifest: `public/manifest.webmanifest` · icone: `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`.

### How the iPhone stays offline

1. Safari → **Condividi → Aggiungi a Home** (vedi sopra). Manifest + service worker (`/sw.js`) cache the app shell.
2. Open the app **after 06:00** (or whenever the Mac has warmed the edition). The client fetches `/api/edition/today`, stores it in **IndexedDB**, and also caches the JSON response in the SW.
3. Later that day, with no network: the UI renders the same snapshot from IndexedDB. **Stampa** still works — it prints the on-screen edition DOM (1×A4, B&W). No auto-print.
4. **Storia** lists server archive + local cache; opening a day uses local copy if present, otherwise fetches once and caches.

### Honest limits (iOS background download)

- Safari / Home Screen web apps **cannot** receive a silent push that downloads the paper at 06:00 while the phone sleeps.
- Background refresh for PWAs on iOS is unreliable; do not depend on it.
- Practical pattern: Mac generates at 06:00 → optional **Shortcuts** morning notification (“Apri The Daily Tailor”) → open-on-wake pulls and caches → stay offline the rest of the day.
- LAN access: phone must reach the Mac URL (same Wi‑Fi / tunnel) for the first download of the day.

## Run locally

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:3847](http://127.0.0.1:3847) on desktop or phone (same LAN / tunnel).

- **iPhone Home Screen:** Safari → **Condividi → Aggiungi a Home**. L’icona apre `/` (edizione di oggi, cache offline dopo il primo download).
- **Print (optional):** tap **Stampa** in-app, oppure Condividi → Stampa di Safari → PDF/printer → one A4 only. Never auto-prints on open.

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
| `WEATHERKIT_*` | — | Optional Apple WeatherKit |
| `NEWS_FEED_URL` | Il Post Mondo RSS | trailing slash required |
| `NEWS_MAX_ITEMS` | `4` | Print budget |
| `REMINDERS_SOURCE` / `REMINDERS_MAX_ITEMS` | `mock` / `4` | |
| `ACTION_EMAIL_SOURCE` / `ACTION_EMAIL_MAX_ITEMS` | `mock` / `3` | |
| `CALENDAR_SOURCE` / `CALENDAR_HORIZON_DAYS` / `CALENDAR_MAX_EVENTS_PER_DAY` | `mock` / `4` / `2` | |
| `NEWSPAPER_TIMEZONE` | `Europe/Rome` | Edition rollover timezone |
| `EDITIONS_DIR` | `./data/editions` | Snapshot JSON store |

## Adapters (next on Mac)

- Reminders → `RemindersAdapter` (EventKit / Shortcuts / AppleScript)
- Action emails → `ActionEmailAdapter` (IMAP / Gmail / Apple Mail), yesterday + actionable only
- Calendar → `CalendarAdapter` (EventKit / CalDAV)
- Weather → Open-Meteo primary; WeatherKit optional

Stubs: `src/lib/reminders/eventkit-stub.ts`, `src/lib/action-emails/imap-stub.ts`, `src/lib/calendar/eventkit-stub.ts`.

## Stack

Next.js, TypeScript, Tailwind CSS. Offline: service worker + IndexedDB.
