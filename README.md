# The Daily Tailor

Personal one-page morning paper, tailored to you — web app for Alessandro Armiento.

**Product name (locked):** The Daily Tailor.

## Provenance / ispirazione

**Non è un’idea originale.** The Daily Tailor nasce da un post visto su Instagram: una ragazza aveva realizzato una sorta di giornale personale quotidiano. Alessandro ha voluto **replicare** quell’idea su Cursor, con le proprie sezioni e integrazioni (meteo, agenda, mail, promemoria, notizie).

Questo repository non rivendica l’invenzione del formato “giornale del mattino in una pagina”: è un remake personale. Licensed under **[ANCA 1.0](https://github.com/alessandroarmiento-lang/ANCA)** (Armiento Non-Commercial Attribution): personal / educational / research use; **no commercial use**; credits in `CREDITS.md` must stay visible in the UI (see [`LICENSE`](LICENSE)).

## What it is

A **web app** whose main page is the newspaper. Read it on **iPhone** (scrollable, touch-friendly). Print / Save as PDF is hard-locked to **exactly one A4 page** — never page 2. Printing is **optional**: tap **Stampa** when you want; the app never auto-prints on open.

Sections:

1. **Today’s weather** — Open-Meteo for the user’s location (browser geolocation on iPhone PWA, applied to the sheet as soon as the fix lands; last known for 06:00 warm; Milano env fallback). The kicker shows the **comune** from reverse geocoding. WeatherKit adapter optional. Mock fallback on failure.
2. **Aforisma del giorno** — one curated saying, picked by edition date (rolls at 06:00).
3. **Agenda** — CalDAV iCloud (Mac-off) or EventKit/Calendar.app (Mac awake). No silent mock.
4. **World news** — Il Post sezione Mondo RSS (`/mondo/feed/`). Mock fallback. Capped for one-page print.
5. **Apple Reminders** — EventKit (Mac awake) or the iPhone push snapshot (Mac-off); CalDAV VTODO only as fallback. No silent mock.
6. **Action emails** — IMAP iCloud+Gmail (Mac-off) or Mail.app (Mac awake); actionable only.

## Morning edition model (locked)

1. Prefer **IMAP/CalDAV credentials** so the day’s edition can be **generated with the Mac powered off** (always-on host or cloud job).
2. At **06:00 Europe/Rome**, a warmer (`launchd` on Mac and/or remote cron) builds that day’s full newspaper **snapshot** into `data/editions/`.
3. The **iPhone downloads** the edition (on open / after generation) and keeps it **offline all day**.
4. When consulting on iPhone, content is served from **device local storage** (IndexedDB + Cache API), not live Mail/Calendar fetches.
5. The web app has an **edition history** (`/storia`) — past days browseable.
6. Weather stays **Open-Meteo** at the device location when possible; email remains fundamental (IMAP iCloud+Gmail or Mail.app fallback).

### Server APIs

| Route | Role |
| --- | --- |
| `GET /api/morning-warm?force=1` | Build + persist today’s edition (launchd at 06:00) |
| `GET /api/edition/today` | Today’s JSON (build if missing) |
| `GET /api/edition/YYYY-MM-DD` | Dated edition from archive (today may build) |
| `GET /api/editions` | List archived editions (newest first) |
| `GET /api/weather?lat=&lon=&save=1` | Live Open-Meteo for coords; `save=1` stores last known for warm |
| `POST /api/weather` | Persist last known lat/lon/city from the PWA |
| `GET /api/weather/location` | Last known weather location (or Milano default) |

Weather location, in short: the PWA asks for GPS on every open (in parallel with the
edition download) and swaps the live block into the sheet; the same fix is stored
server-side so the 06:00 warm starts from the reader's last position. The place label is
re-derived from the coordinates on every read — BigDataCloud's `city` is the *provincia*
(Legnano answers "Milano"), so the comune (OSM `adminLevel` 8) wins. Open
`/?lat=45.61&lon=8.93` to render the sheet on a given position from any browser: it does
not touch the stored fix.
| `POST /api/reminders/ingest?warm=1` | iPhone Shortcut pushes open reminders (token header); `warm=1` rebuilds now |
| `GET /api/reminders/ingest` | Snapshot status: age, count, freshness (same token) |

Snapshots are written under `data/editions/YYYY-MM-DD.json` (gitignored — may contain personal email/reminders). Override with `EDITIONS_DIR`.

### 06:00 generation — preferred: Fly.io always-on host

Production target: **Fly.io** (not Raspberry Pi / not Minda). The container runs Next + supercronic at **06:00 Europe/Rome**, persists editions on a volume, and uses IMAP/CalDAV secrets.

- Infra: `Dockerfile`, `fly.toml`, `deploy/fly/`
- Steps (Italian): see project docs `host-esterno.md` in the Agent Store, or:

```bash
# After: fly auth login
./deploy/fly/deploy.sh
```

iPhone: open `https://<app>.fly.dev/` (Home Screen icon). First fetch of the day pulls `/api/edition/today`.

### Promemoria with the Mac off — iPhone push

Apple Reminders were migrated to **CloudKit**: iCloud CalDAV only exposes an empty VTODO stub, so no headless host can read them. The phone pushes them instead.

1. Generate a token once and keep it in `.env.local` (never committed):

```bash
openssl rand -hex 32   # paste into REMINDERS_INGEST_TOKEN=
./deploy/fly/set-secrets.sh   # imports it into Fly (names only logged)
```

2. iOS Shortcut (see `promemoria-iphone.md` in the Agent Store): **Trova promemoria** → Repeat → Dictionary (`title`, `listName`, `dueAt` ISO with `XXX` offset not `XXXXX`, `notes`, `priority`, `id` = `listName|title`) → **Ottieni contenuto da URL** `POST …/api/reminders/ingest` with `Content-Type` + `X-Ingest-Token`. Automation at **05:55** must use **Esegui comando rapido**, not **Apri** (Open only edits the shortcut; it does not POST). Rebuild with `python3 scripts/macos/build-reminders-shortcut.py`.
3. The snapshot lands on the editions volume (`$EDITIONS_DIR/pushed-reminders.json`) and wins over CalDAV while it is fresh (`REMINDERS_PUSH_MAX_AGE_HOURS`, default 36h). Source label reads `iPhone (Promemoria · <ora>)`.
4. From the Mac (awake) the same payload can be pushed with EventKit:

```bash
./scripts/macos/push-reminders-to-host.sh --warm
```

### 06:00 generation — optional fallback: Mac LaunchAgent

Use only when the Mini is awake and you want a local warm. Does not replace Fly.

1. Keep the Next app running on the Mac (`npm run dev` or `npm run start` on port **3847**).
2. Install the LaunchAgent:

```bash
./deploy/macos/install-morning-launchd.sh
```

3. Manual test: `./deploy/morning-warm.sh` or `curl -s 'http://127.0.0.1:3847/api/morning-warm?force=1'`.

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
| `NEWS_MAX_ITEMS` | `6` | Print budget |
| `REMINDERS_SOURCE` / `REMINDERS_MAX_ITEMS` | `auto` / `6` | On Mac `auto` prefers EventKit; elsewhere iPhone push, then CalDAV |
| `REMINDERS_INGEST_TOKEN` | — | Shared token for `POST /api/reminders/ingest` (iPhone Shortcut) |
| `REMINDERS_PUSH_MAX_AGE_HOURS` | `36` | How long a pushed snapshot stays preferred over CalDAV |
| `ACTION_EMAIL_SOURCE` / `ACTION_EMAIL_MAX_ITEMS` | `auto` / `4` | `auto`\|`imap`\|`applemail`\|`mock` |
| `CALENDAR_SOURCE` / `CALENDAR_HORIZON_DAYS` | `auto` / `4` | On Mac `auto` prefers EventKit (all calendars); all events per day |
| `ICLOUD_MAIL_USER` / `ICLOUD_MAIL_APP_PASSWORD` | — | IMAP + CalDAV/CardDAV (Mac-off) |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | — | Gmail IMAP + Google Calendar CalDAV (Mac-off) |
| `GOOGLE_CALDAV_URL` | auto legacy `/calendar/dav/<user>/events/` | Optional override |
| `NEWSPAPER_TIMEZONE` | `Europe/Rome` | Edition rollover timezone |
| `EDITIONS_DIR` | `./data/editions` | Snapshot JSON store |

## Adapters (real data)

- **Mac-off (preferred):** IMAP (`imapflow`) for iCloud+Gmail; CalDAV iCloud (`tsdav`) + Google legacy CalDAV REPORT for calendar; CardDAV for Contacts match. Apple Reminders (CloudKit) are **not** on CalDAV — the iPhone pushes them to `/api/reminders/ingest`.
- **Mac-awake fallback:** AppleScript → Mail.app / Calendar.app / Reminders.app (TCC Automation). Helper: `scripts/macos/grant-apple-access.sh`.
- Weather → Open-Meteo primary; WeatherKit optional.
- Personal sections never silently fall back to fixture mocks.

## Stack

Next.js, TypeScript, Tailwind CSS. Offline: service worker + IndexedDB.
